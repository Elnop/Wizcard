import * as fs from 'node:fs';
import { evaluate, Unresolved } from './evaluate';
import { capRatio, fontRatios, inkRatios } from './font-metrics';
import { parseExpression, unwrapFieldValue } from './parser';
import { buildScope } from './scope';
import {
	GEOMETRY_FIELDS,
	readStyleFile,
	type FieldFontInfo,
	type GeometryField,
	type RawFont,
	type RawPadding,
} from './style-file';
import type { Scope } from './scope';

const { readFileSync } = fs;
// `globSync` existe à l'exécution (Node 22) mais @types/node reste figé sur
// ^20 pour le reste du repo : on ne bascule pas cette dépendance partagée
// pour une seule commande, donc on complète le typage localement.
const globSync = (fs as unknown as { globSync: (pattern: string) => string[] }).globSync;

/** Zones exigées pour qu'un gabarit soit publiable. Voir « aucun fallback ». */
const REQUIRED_FIELDS: GeometryField[] = ['image', 'name', 'type', 'text'];
const BOX_KEYS = ['left', 'top', 'width', 'height'] as const;

/**
 * Ancres lues en plus des quatre canoniques. MSE accepte n'importe quelle
 * paire suffisante par axe, et `right`/`bottom` sont des coordonnées ABSOLUES
 * du bord — pas des marges.
 */
const ANCHOR_KEYS = [...BOX_KEYS, 'right', 'bottom'] as const;
type AnchorKey = (typeof ANCHOR_KEYS)[number];

/**
 * Une boîte est plausible si elle a une aire positive et tient dans la carte,
 * à quelques pixels de tolérance près (certains cadres débordent volontairement
 * de 1 à 2 px pour couvrir la bordure).
 */
function isPlausibleBox(box: Partial<ResolvedBox>, cardWidth: number, cardHeight: number): boolean {
	const { left, top, width, height } = box;
	if (left === undefined || top === undefined || width === undefined || height === undefined) {
		// Boîte incomplète : ce n'est pas à cette fonction de trancher, l'appelant
		// la rejettera déjà faute d'ancres suffisantes.
		return true;
	}
	const margin = 5;
	if (width <= 0 || height <= 0) return false;
	if (left < -margin || top < -margin) return false;
	return left + width <= cardWidth + margin && top + height <= cardHeight + margin;
}

/**
 * Complète une boîte à partir des ancres disponibles, un axe à la fois.
 *
 * Horizontal : `left`+`width` tel quel, sinon `right-left` donne la largeur,
 * sinon `right-width` donne l'origine. Idem en vertical avec `bottom`/`top`.
 * On ne DEVINE jamais une ancre manquante : si aucune paire n'est complète,
 * la boîte reste incomplète et le champ sera rejeté par l'appelant.
 */
function completeBox(anchors: Partial<Record<AnchorKey, number>>): Partial<ResolvedBox> {
	const box: Partial<ResolvedBox> = {};
	const { left, right, width, top, bottom, height } = anchors;

	if (left !== undefined) box.left = left;
	if (width !== undefined) box.width = width;
	if (box.left === undefined && right !== undefined && width !== undefined) {
		box.left = right - width;
	}
	if (box.width === undefined && right !== undefined && left !== undefined) {
		box.width = right - left;
	}

	if (top !== undefined) box.top = top;
	if (height !== undefined) box.height = height;
	if (box.top === undefined && bottom !== undefined && height !== undefined) {
		box.top = bottom - height;
	}
	if (box.height === undefined && bottom !== undefined && top !== undefined) {
		box.height = bottom - top;
	}

	return box;
}

export interface ResolvedBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * Police RÉSOLUE d'un champ : le nom tel que MSE l'écrit, et la taille en
 * unités de style (le repère de la carte, ex. 375x523 — pas des pixels canvas).
 */
export interface ResolvedFont {
	name: string;
	size: number;
	/**
	 * Ascendante/descendante en fraction de la taille, lues dans le TTF livré.
	 *
	 * Publiées avec la police pour que le canvas puisse POSER la ligne de base
	 * sans embarquer un lecteur de TTF : le haut des glyphes est à
	 * `baseline - size × ascent`, le bas à `baseline + size × descent`.
	 *
	 * Absentes si la police n'est pas livrée (styles exotiques du corpus) — le
	 * canvas retombe alors sur son placement générique.
	 */
	ascent?: number;
	descent?: number;
	/**
	 * Ascendante/descendante de l'ENCRE (hauteur d'ascendante `Hb`, descendantes
	 * `gpqy`), distinctes de `ascent`/`descent` qui décrivent la LIGNE.
	 *
	 * MSE aligne un champ `alignment: top` sur l'encre, pas sur la ligne : la
	 * différence est l'interligne interne de la police, qui varie de 0 (Matrix) à
	 * 0.196 em (Beleren Bold). Publier les deux jeux permet au canvas d'ancrer
	 * chaque cas sur la bonne métrique sans relire les TTF.
	 */
	inkAscent?: number;
	inkDescent?: number;
	/**
	 * Hauteur de capitale, en fraction de la taille.
	 *
	 * C'est elle qui porte le centrage vertical dans un bandeau : les cartes
	 * imprimées centrent la bande des capitales, pas le bloc ascendante+descendante
	 * (cf. `capRatio`).
	 */
	capHeight?: number;
	/**
	 * Couleur du texte, telle que le style la déclare (137 gabarits sur 140).
	 *
	 * Le studio écrivait tout en `#17140d`, une constante du canvas, et
	 * `frame_text_colors` stocke la MÊME valeur pour tous les gabarits — donc une
	 * donnée inventée, pas mesurée. `magic-extended-art` déclare pourtant
	 * `rgb(255,255,255)` : son texte était quasi invisible.
	 *
	 * Absente si le style n'en déclare pas : le canvas garde alors son encre par
	 * défaut, qui reste ce qu'il affichait déjà.
	 */
	color?: string;
	/** Ombre portée, quand le style en déclare une (40 gabarits sur 140). */
	shadow?: ResolvedShadow;
}

/**
 * Ombre portée du texte.
 *
 * C'est ce qui rend lisible le texte des cadres SANS panneau de règles : MSE n'y
 * dessine aucune boîte, il pose du texte clair souligné d'une ombre directement
 * sur l'illustration. Publier la couleur sans l'ombre donnerait du blanc sur une
 * illustration claire — illisible.
 *
 * Le déplacement est en unités de style, comme les tailles : il passe par le
 * même facteur d'échelle que les boîtes.
 */
export interface ResolvedShadow {
	color: string;
	dx: number;
	dy: number;
}

/** Champs dont la police est publiée, c.-à-d. ceux que le canvas ÉCRIT. */
export const FONT_OUTPUT_FIELDS = ['name', 'type', 'text', 'pt'] as const;
export type FontOutputField = (typeof FONT_OUTPUT_FIELDS)[number];

/**
 * Ancrage vertical du texte dans sa boîte, tel que MSE le déclare.
 *
 * Le corpus est très régulier par champ : `name` bottom (219), `pt` middle
 * (243), `type` top (187). Le canvas, lui, posait une ligne de base constante
 * (`boîte + 36`) qui ne correspond à AUCUN de ces trois ancrages — d'où 125
 * gabarits sur 136 dont la ligne de type débordait par le bas.
 */
export type VerticalAnchor = 'top' | 'middle' | 'bottom';

/** Marges intérieures résolues, en unités de style. */
export interface ResolvedPadding {
	top?: number;
	left?: number;
	right?: number;
	bottom?: number;
}

/** Où poser le texte dans sa boîte : ancrage + marges. */
export interface ResolvedLayout {
	anchor?: VerticalAnchor;
	padding?: ResolvedPadding;
}

export interface TemplateGeometry {
	cardWidth: number;
	cardHeight: number;
	boxes: Partial<Record<GeometryField, ResolvedBox>>;
	/** AST conservé pour permettre une évaluation dynamique plus tard. */
	ast: Partial<Record<GeometryField, Record<string, unknown>>>;
	/**
	 * Polices déclarées par le style, par champ.
	 *
	 * Le canvas écrivait Georgia et Arial en dur, qui n'apparaissent nulle part
	 * dans le corpus pour ces champs : le style déclare Beleren Bold, Matrix,
	 * ModMatrix, MPlantin ou MagicMedieval selon son époque.
	 *
	 * PARTIEL, et volontairement : un champ dont la police ne se résout pas est
	 * ABSENT plutôt que comblé — même règle « aucun fallback » que les boîtes.
	 * Contrairement à elles, une police manquante ne disqualifie PAS le gabarit :
	 * sa géométrie reste juste, et le rendu retombe sur la pile générique du
	 * canvas. Refuser le cadre entier pour une police non lue le retirerait de la
	 * bibliothèque sans nécessité.
	 */
	fonts: Partial<Record<FontOutputField, ResolvedFont>>;
	/**
	 * Ancrage et marges, par champ. Même statut que `fonts` : partiel, et une
	 * valeur non résolue est absente plutôt que devinée.
	 */
	layout: Partial<Record<FontOutputField, ResolvedLayout>>;
}

/**
 * Résout une valeur de police (nom ou taille), littérale ou pilotée par script.
 *
 * Le corpus écrit les deux formes pour un même champ :
 *   name: Beleren Bold          <- littéral, la majorité
 *   name: { name_font() }       <- expression, ~180 déclarations
 *
 * Les formes pilotées appellent des fonctions du script de la partie
 * (`name_font`, `type_font`, `body_font`, `pt_font`), déjà chargées dans la
 * portée par `buildScope`. Elles retombent sur `swap_fonts_*_default`, soit
 * « Beleren Bold » 16 / « Beleren Bold » 13 / « MPlantin » 13 / « Beleren Bold »
 * 16 — les valeurs de la carte canonique, l'utilisateur MSE n'ayant surchargé
 * aucun `styling.custom_*_font`.
 *
 * Une valeur non résoluble rend `null` : l'appelant OMET alors le champ. On ne
 * devine pas de police, conformément à « aucun fallback ».
 */
function resolveFontValue(raw: string | undefined, scope: Scope): unknown {
	if (raw === undefined) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	// `unwrapFieldValue` rend le contenu d'un `{ … }` et `null` pour un bloc
	// `script:` multi-ligne, qu'on ne sait pas évaluer ici.
	const source = unwrapFieldValue(trimmed);
	// Pas d'accolades : le littéral est la valeur elle-même (« Beleren Bold »),
	// pas une expression — l'analyser en tomberait sur un identifiant inconnu.
	if (source === null) return null;
	if (source === trimmed && !trimmed.startsWith('{')) return trimmed;
	try {
		return evaluate(parseExpression(source), scope);
	} catch {
		return null;
	}
}

/**
 * Police d'un champ : nom + taille, ou `undefined` si l'un des deux manque.
 *
 * Les deux sont exigés ensemble. Un nom sans taille laisserait le canvas
 * inventer un corps, et une taille sans nom l'appliquerait à une police
 * générique : dans les deux cas le rendu serait faux d'une manière que
 * l'utilisateur ne pourrait pas expliquer. Mieux vaut l'absence, qui laisse le
 * canvas sur sa pile générique assumée.
 */
function resolveFieldFont(info: FieldFontInfo | undefined, scope: Scope): ResolvedFont | undefined {
	const name = resolveFontValue(info?.font?.name, scope);
	const size = resolveFontValue(info?.font?.size, scope);
	if (typeof name !== 'string') return undefined;
	const trimmedName = name.trim();
	if (!trimmedName) return undefined;
	const numericSize = typeof size === 'number' ? size : Number(size);
	if (!Number.isFinite(numericSize) || numericSize <= 0) return undefined;
	// Métriques lues dans le TTF livré. Absentes pour une police non livrée :
	// la police reste publiée (le nom sert au rendu), seul le calcul de ligne
	// de base retombe alors sur le placement générique.
	const ratios = fontRatios(trimmedName);
	const ink = inkRatios(trimmedName);
	const cap = capRatio(trimmedName);
	const color = resolveColor(info?.font?.color, scope);
	const shadow = resolveShadow(info?.font, scope);
	return {
		name: trimmedName,
		size: numericSize,
		...ratios,
		...(ink ? { inkAscent: ink.ascent, inkDescent: ink.descent } : {}),
		...(cap !== undefined ? { capHeight: cap } : {}),
		...(color ? { color } : {}),
		...(shadow ? { shadow } : {}),
	};
}

/**
 * Couleur MSE (`rgb(r,g,b)` ou un nom comme `white`) vers une couleur CSS.
 *
 * Les deux formes sont valides en CSS telles quelles — `rgb(0,0,0)` et `white`
 * s'écrivent pareil des deux côtés. On se contente donc de valider la forme et
 * de normaliser les espaces, sans réécrire : convertir en hexadécimal ferait
 * perdre les noms et n'apporterait rien au canvas.
 *
 * Une valeur qu'on ne reconnaît pas est REJETÉE plutôt que passée telle quelle :
 * une couleur invalide rendrait le texte noir par défaut du navigateur, ce qui
 * ressemble à un rendu correct tout en étant faux. L'absence, elle, laisse le
 * canvas sur son encre assumée.
 */
function resolveColor(raw: string | undefined, scope: Scope): string | undefined {
	const value =
		typeof raw === 'string' && !raw.trim().startsWith('{') ? raw : resolveFontValue(raw, scope);
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	const rgb = /^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(trimmed);
	if (rgb) {
		const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
		if (channels.some((channel) => channel > 255)) return undefined;
		return `rgb(${channels.join(',')})`;
	}
	// Noms CSS : le corpus n'écrit que des mots simples (`white`, `black`).
	return /^[a-z]+$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/**
 * Ombre portée, ou `undefined`.
 *
 * Les trois composantes sont exigées ENSEMBLE. Une couleur sans déplacement
 * peindrait l'ombre exactement sous le texte (donc invisible, et inutilement
 * coûteuse), et un déplacement sans couleur n'a rien à peindre. Le corpus les
 * déclare toujours groupées.
 */
function resolveShadow(font: RawFont | undefined, scope: Scope): ResolvedShadow | undefined {
	const color = resolveColor(font?.shadowColor, scope);
	if (!color) return undefined;
	const dx = resolveFontValue(font?.shadowDx, scope);
	const dy = resolveFontValue(font?.shadowDy, scope);
	const numericDx = Number(dx);
	const numericDy = Number(dy);
	if (!Number.isFinite(numericDx) || !Number.isFinite(numericDy)) return undefined;
	if (numericDx === 0 && numericDy === 0) return undefined;
	return { color, dx: numericDx, dy: numericDy };
}

/**
 * Ancrage vertical lu dans une chaîne `alignment:`.
 *
 * MSE mélange horizontale et verticale dans la même chaîne (« top
 * shrink-overflow », « center middle shrink-overflow », « middle left »), dans
 * un ordre libre. On ne cherche donc que le mot-clé vertical.
 *
 * Les formes pilotées par script (40 champs) sont évaluées comme le reste ; si
 * l'évaluation échoue, l'ancrage reste absent — jamais deviné.
 */
function resolveAnchor(raw: string | undefined, scope: Scope): VerticalAnchor | undefined {
	const value =
		typeof raw === 'string' && !raw.trim().startsWith('{') ? raw : resolveFontValue(raw, scope);
	if (typeof value !== 'string') return undefined;
	const words = value.toLowerCase();
	// `middle` d'abord : « center middle » contient les deux, et c'est `middle`
	// qui porte la verticale — `center` est l'horizontale.
	if (words.includes('middle')) return 'middle';
	if (words.includes('bottom')) return 'bottom';
	if (words.includes('top')) return 'top';
	return undefined;
}

/** Marges intérieures résolues ; un côté non résolu est simplement absent. */
function resolvePadding(raw: RawPadding | undefined, scope: Scope): ResolvedPadding | undefined {
	if (!raw) return undefined;
	const out: ResolvedPadding = {};
	for (const side of ['top', 'left', 'right', 'bottom'] as const) {
		// Côté non déclaré : on passe. `Number(null)` vaut 0, ce qui aurait
		// publié une marge nulle là où le style n'en déclare AUCUNE — un
		// fallback déguisé, et le même piège que `nil` sur les ancres.
		if (raw[side] === undefined) continue;
		const value = resolveFontValue(raw[side], scope);
		if (value === null) continue;
		const numeric = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(numeric)) out[side] = numeric;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export interface ExtractionReport {
	total: number;
	resolved: number;
	rejected: Array<{ id: string; field: string; key: string; reason: string }>;
	/** Noms manquants, triés par nombre de gabarits bloqués — la file de travail. */
	missingByName: Array<[string, number]>;
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- safe: une passe par gabarit x champ x clé, dérouler fragmenterait la logique de rejet sans la simplifier
export function extractAll(corpusRoot: string): {
	geometries: Map<string, TemplateGeometry>;
	report: ExtractionReport;
} {
	const gameScript = readFileSync(`${corpusRoot}/magic.mse-game/script`, 'utf8');
	const files = globSync(`${corpusRoot}/*.mse-style/style`);
	const geometries = new Map<string, TemplateGeometry>();
	const rejected: ExtractionReport['rejected'] = [];
	const missing = new Map<string, Set<string>>();

	for (const file of files) {
		const style = readStyleFile(file, corpusRoot);
		if (!style) continue;
		const scope = buildScope(readFileSync(file, 'utf8'), gameScript, style.fontFields, {
			width: style.cardWidth,
			height: style.cardHeight,
		});
		const boxes: TemplateGeometry['boxes'] = {};
		const ast: TemplateGeometry['ast'] = {};
		let ok = true;

		for (const field of GEOMETRY_FIELDS) {
			const raw = style.fields[field];
			if (!raw) {
				// Un champ REQUIS absent disqualifie : on ne comble pas.
				if (REQUIRED_FIELDS.includes(field)) {
					rejected.push({ id: style.id, field, key: '*', reason: 'champ absent' });
					ok = false;
				}
				continue;
			}
			const anchors: Partial<Record<AnchorKey, number>> = {};
			const fieldAst: Record<string, unknown> = {};
			for (const key of ANCHOR_KEYS) {
				const value = raw[key];
				if (value === undefined) continue;
				const source = unwrapFieldValue(value);
				if (source === null) {
					rejected.push({ id: style.id, field, key, reason: 'bloc script:' });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					continue;
				}
				try {
					const node = parseExpression(source);
					fieldAst[key] = node;
					const value = evaluate(node, scope);
					// `evaluate` peut désormais renvoyer le littéral `nil` (tâche 6d,
					// `Value` inclut `null`) : `Number(null)` vaudrait 0 silencieusement,
					// un fallback déguisé. Une géométrie n'est JAMAIS censée être `nil`
					// dans le corpus — donc refuser plutôt que deviner « 0 ».
					if (value === null) throw new Unresolved(`${field}.${key} vaut nil`);
					anchors[key] = Number(value);
				} catch (error) {
					const reason = error instanceof Unresolved ? error.what : (error as Error).message;
					rejected.push({ id: style.id, field, key, reason });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					if (error instanceof Unresolved) {
						const set = missing.get(error.what) ?? new Set<string>();
						set.add(style.id);
						missing.set(error.what, set);
					}
				}
			}
			// Les ancres lues sont converties en left/top/width/height : un champ
			// ancré à droite (`left`+`right`) est aussi complet qu'un `left`+`width`.
			const box = completeBox(anchors);
			// Une boîte hors carte ou de taille nulle est le signe que les ancres
			// résolues ne décrivent pas la même chose (ex. un `right` évalué dans
			// un repère différent) : la publier donnerait une carte visiblement
			// cassée. On la refuse, conformément à « aucun fallback ».
			if (!isPlausibleBox(box, style.cardWidth, style.cardHeight)) {
				rejected.push({ id: style.id, field, key: '*', reason: 'boîte hors carte' });
				if (REQUIRED_FIELDS.includes(field)) ok = false;
				continue;
			}
			if (BOX_KEYS.every((key) => typeof box[key] === 'number')) {
				boxes[field] = box as ResolvedBox;
				ast[field] = fieldAst;
			} else if (REQUIRED_FIELDS.includes(field)) {
				ok = false;
			}
		}

		if (ok) {
			// Résolue APRÈS les boîtes : `buildScope` a pu injecter des variables
			// (content_width) dont une expression de police peut dépendre.
			const fonts: TemplateGeometry['fonts'] = {};
			const layout: TemplateGeometry['layout'] = {};
			for (const field of FONT_OUTPUT_FIELDS) {
				const info = style.fontFields[field];
				const font = resolveFieldFont(info, scope);
				if (font) fonts[field] = font;
				const anchor = resolveAnchor(info?.alignment, scope);
				const padding = resolvePadding(info?.padding, scope);
				if (anchor || padding)
					layout[field] = { ...(anchor && { anchor }), ...(padding && { padding }) };
			}
			geometries.set(style.id, {
				cardWidth: style.cardWidth,
				cardHeight: style.cardHeight,
				boxes,
				ast,
				fonts,
				layout,
			});
		}
	}

	return {
		geometries,
		report: {
			total: files.length,
			resolved: geometries.size,
			rejected,
			missingByName: [...missing.entries()]
				.map(([name, ids]): [string, number] => [name, ids.size])
				.sort((a, b) => b[1] - a[1]),
		},
	};
}

const CORPUS = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';

if (process.argv[1]?.endsWith('extract.ts')) {
	const { report } = extractAll(CORPUS);
	console.log(`gabarits entièrement résolus : ${report.resolved}/${report.total}`);
	console.log(`champs rejetés : ${report.rejected.length}`);
	console.log('\nnoms manquants, par nombre de gabarits bloqués :');
	for (const [name, count] of report.missingByName.slice(0, 25)) {
		console.log(`  ${String(count).padStart(4)}  ${name}`);
	}
}
