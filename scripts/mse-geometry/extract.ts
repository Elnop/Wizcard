import * as fs from 'node:fs';
import { evaluate, Unresolved } from './evaluate';
import { parseExpression, unwrapFieldValue } from './parser';
import { buildScope } from './scope';
import { GEOMETRY_FIELDS, readStyleFile, type GeometryField } from './style-file';

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

export interface TemplateGeometry {
	cardWidth: number;
	cardHeight: number;
	boxes: Partial<Record<GeometryField, ResolvedBox>>;
	/** AST conservé pour permettre une évaluation dynamique plus tard. */
	ast: Partial<Record<GeometryField, Record<string, unknown>>>;
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
			geometries.set(style.id, {
				cardWidth: style.cardWidth,
				cardHeight: style.cardHeight,
				boxes,
				ast,
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
