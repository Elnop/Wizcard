import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { IMAGE_MASK_LINE, IMAGE_MASK_SCRIPT_LINE, maskFileFrom } from './image-mask.mjs';

/**
 * Nommé parce qu'il apparaît dans les trois listes ci-dessous : c'est à la fois
 * une zone géométrique, un champ à `content_width` et un champ porteur de police.
 */
const CASTING_COST = 'casting cost';

/** Les zones dont le studio a besoin. Tout autre bloc du style est ignoré. */
export const GEOMETRY_FIELDS = ['image', 'name', 'type', 'text', 'pt', CASTING_COST] as const;
export type GeometryField = (typeof GEOMETRY_FIELDS)[number];

/**
 * Alias de noms de champ : même géométrie, orthographe différente selon les
 * gabarits. Vérifié un par un sur le corpus (jamais deviné) :
 * - « rule text » remplace « text » dans 37 gabarits sur 376 (aucun des deux
 *   n'a JAMAIS les deux — cf. `magic-rulestip`, `vanguard-standard`) ;
 * - « rule_text » (soulignement) apparaît une fois, dans
 *   `magic-baseball-1980-topps`, seul champ de texte de règles du gabarit.
 * Les variantes `text 2` / `rule text 2` / `rule text 3` / `center rule
 * text` / `forwarded rule text 2` sont des boîtes SECONDAIRES (verso, texte
 * alternatif) et ne sont PAS des alias du champ primaire : les 5 gabarits qui
 * ont `center rule text` ont aussi `rule text`, donc l'alias primaire suffit
 * à les résoudre sans y toucher. Pas d'alias trouvé pour `image` / `name` /
 * `type` : leurs quasi-doublons (`image 2`, `name 2`, `type 2`, `urban
 * type`, `scroll type`, …) sont des boîtes différentes, pas des synonymes —
 * cf. règle « aucun fallback », on ne devine pas.
 */
const FIELD_ALIASES: Partial<Record<GeometryField, readonly string[]>> = {
	text: ['rule text', 'rule_text'],
};

/** Table inverse alias → nom canonique, construite une seule fois. */
const ALIAS_TO_CANONICAL = new Map<string, GeometryField>(
	Object.entries(FIELD_ALIASES).flatMap(([canonical, aliases]) =>
		(aliases ?? []).map((alias): [string, GeometryField] => [alias, canonical as GeometryField])
	)
);

/** Résout un nom de champ BRUT (tel qu'écrit dans le style) vers son nom canonique. */
function resolveFieldName(raw: string): GeometryField | ContentWidthField | null {
	if (GEOMETRY_FIELDS.includes(raw as GeometryField)) return raw as GeometryField;
	if (CONTENT_WIDTH_FIELDS.includes(raw as ContentWidthField)) return raw as ContentWidthField;
	return ALIAS_TO_CANONICAL.get(raw) ?? null;
}

/**
 * Champs supplémentaires lus pour `content_width` (tâche 6) : « rarity » n'est
 * pas une boîte que le studio dessine (absente de GEOMETRY_FIELDS), mais son
 * bloc doit quand même être lu pour calculer la largeur que d'AUTRES champs
 * référencent via `card_style.rarity.content_width`.
 */
const CONTENT_WIDTH_FIELDS = [CASTING_COST, 'rarity'] as const;
type ContentWidthField = (typeof CONTENT_WIDTH_FIELDS)[number];
type TrackedField = GeometryField | ContentWidthField;

/**
 * Champs dont la POLICE est lue, en plus de la boîte.
 *
 * `content_width` n'en avait besoin que pour `casting cost` / `rarity` (mesurer
 * une largeur de texte). Le canvas, lui, doit ÉCRIRE avec la bonne police : il
 * lui faut donc aussi celles des champs qu'il peint.
 *
 * Le corpus les déclare toutes — vérifié : sur les seules familles officielles,
 * `name`/`type`/`text`/`pt` totalisent 178 MPlantin, 166 Beleren Bold, 156
 * Matrix, 67 ModMatrix, plus les formes pilotées par script. Le canvas écrivait
 * jusqu'ici Georgia et Arial en dur, qui n'apparaissent NULLE PART dans le
 * corpus pour ces champs.
 *
 * `rarity` reste hors liste : c'est une icône, pas du texte que le studio écrit.
 */
const FONT_FIELDS = ['name', 'type', 'text', 'pt', CASTING_COST] as const;
type FontField = (typeof FONT_FIELDS)[number];

/** Champ portant un sous-bloc `font:`, quelle qu'en soit la raison. */
export type FontBearingField = ContentWidthField | FontField;

/** Ce champ ouvre-t-il un sous-bloc `font:` à lire ? */
function bearsFont(field: TrackedField | null): field is FontBearingField {
	return (
		field !== null &&
		(CONTENT_WIDTH_FIELDS.includes(field as ContentWidthField) ||
			FONT_FIELDS.includes(field as FontField))
	);
}

/**
 * Ancres BRUTES d'une boîte : un nombre (« 29 ») ou une expression
 * (« { max(30, …) } »).
 *
 * MSE positionne une boîte avec n'importe quelle paire suffisante : `left` +
 * `width`, mais aussi `left` + `right`, ou `right` + `width` sans `left`.
 * `right` et `bottom` sont des COORDONNÉES ABSOLUES du bord (pas des marges),
 * d'où `width = right - left`. Les ignorer revenait à jeter 341 gabarits qui
 * ancrent à droite et 162 qui ancrent en bas — dont `magic-m15`, notre
 * référence, dont le champ `name` n'a pas de `width`.
 */
export interface RawBox {
	left?: string;
	top?: string;
	width?: string;
	height?: string;
	right?: string;
	bottom?: string;
}

/** Un sous-bloc `font:` / `symbol font:` : nom et taille, tels qu'écrits dans le style. */
export interface RawFont {
	name?: string;
	size?: string;
}

/** Marges INTÉRIEURES d'un champ, telles qu'écrites dans le style. */
export interface RawPadding {
	top?: string;
	left?: string;
	right?: string;
	bottom?: string;
}

/** Ce dont un champ a besoin pour que `content_width` soit mesurable (tâche 6). */
export interface FieldFontInfo {
	width?: string;
	font?: RawFont;
	symbolFont?: RawFont;
	/**
	 * `alignment:` du champ, brut. MSE y met l'horizontale et la verticale dans
	 * la même chaîne (« top shrink-overflow », « middle left »), parfois pilotée
	 * par script. C'est elle qui dit où poser le texte DANS la boîte — le canvas
	 * utilisait un décalage constant, qui ne correspond ni à `top` ni à `middle`.
	 *
	 * Le corpus est très régulier par champ : `name` bottom (219), `pt` middle
	 * (243), `type` top (187).
	 */
	alignment?: string;
	/**
	 * `padding top/left/right/bottom:`. 1253 littéraux contre 5 expressions dans
	 * le corpus, d'où l'intérêt de les lire plutôt que de garder les marges
	 * codées en dur du canvas (+18, +16, +24…).
	 */
	padding?: RawPadding;
}

export interface StyleFile {
	/** Nom du paquet sans le suffixe, ex. « magic-m15 ». */
	id: string;
	cardWidth: number;
	cardHeight: number;
	fields: Partial<Record<GeometryField, RawBox>>;
	/**
	 * Polices déclarées, par champ (cf. FieldFontInfo).
	 *
	 * Deux usages distincts partagent cette structure : `content_width` la lit
	 * pour `casting cost` / `rarity` (mesure de largeur), et le canvas pour
	 * `name` / `type` / `text` / `pt` (écriture du texte). D'où une clé élargie
	 * à l'union des deux ensembles.
	 */
	fontFields: Partial<Record<FontBearingField, FieldFontInfo>>;
	/**
	 * Nom du fichier de masque déclaré par `mask:` dans le bloc `image:`, s'il
	 * y en a un. Sert à creuser la fenêtre d'illustration dans un cadre opaque.
	 * Absent quand le style n'en déclare pas — le rendu retombe alors sur la
	 * géométrie mesurée.
	 */
	imageMask?: string;
}

const BOX_KEYS = ['left', 'top', 'width', 'height', 'right', 'bottom'] as const;

/**
 * Une ligne de commentaire MSE : `#` en tout début de section (éventuellement
 * précédé d'espaces/tabulations pour les commentaires imbriqués dans un
 * champ). MSE les utilise pour titrer des groupes de champs SANS les
 * indenter d'une tabulation, ex. `############# Background stuff` juste après
 * `card style:` — cf. `magic-m15-saga.mse-style`. Une telle ligne ne doit
 * jamais être confondue avec l'ouverture de la section suivante (`extra card
 * style:`, `styling style:`), qui n'est ni vide ni un commentaire.
 */
function isCommentLine(line: string): boolean {
	return /^\s*#/.test(line);
}

/**
 * Découpe le bloc `card style:` : ses enfants sont indentés d'UNE tabulation,
 * leurs propriétés de deux. On s'arrête à la première ligne non indentée QUI
 * N'EST PAS un commentaire — un commentaire en colonne 0 (titre de section,
 * cf. `isCommentLine`) est ignoré mais ne termine pas le bloc, sans quoi un
 * style qui commente ainsi ses sections perdrait TOUS ses champs (bug
 * constaté sur `magic-m15-saga.mse-style` : bloc capturé vide).
 */
function cardStyleBlock(lines: string[]): string[] {
	const start = lines.findIndex((line) => line.trimEnd().startsWith('card style:'));
	if (start === -1) return [];
	const block: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && !line.startsWith('\t') && !isCommentLine(line)) break;
		block.push(line);
	}
	return block;
}

/**
 * Cible d'un `include file:` capable d'apporter des CHAMPS (un fichier avec
 * son propre en-tête `card style:`), par opposition aux fragments imbriqués
 * dans un champ (choix d'images, scripts) qui n'en ont jamais un — vérifié
 * sur les 86 cibles absolues du corpus : seules 14 ont cet en-tête, toutes à
 * une profondeur de 0 ou 1 tabulation dans le fichier qui les inclut. Un
 * chemin RELATIF (sans « / » de tête) désigne toujours un script du MÊME
 * paquet (ex. `font_m15`), jamais un bloc `card style:` — vérifié aussi,
 * donc ignoré ici sans perte.
 *
 * Le séparateur après « include file: » peut être une tabulation OU une
 * espace selon les fichiers.
 */
const INCLUDE_DIRECTIVE = /^(\t?)include file:[\t ]+(\/\S+)\s*$/;

/**
 * Relève les cibles `include file:` d'UN fichier de style, dans l'ordre où
 * elles apparaissent. On ne regarde que les lignes à 0 ou 1 tabulation : à
 * deux tabulations ou plus, la directive est nichée DANS un champ déjà ouvert
 * (ex. `rarity: / include file: .../choice_images`) et ne peut apporter que
 * des propriétés de ce champ, jamais un nouveau champ — cf. commentaire de
 * INCLUDE_DIRECTIVE. On ne les résout donc pas ici.
 */
function collectIncludeTargets(lines: string[]): string[] {
	const targets: string[] = [];
	for (const line of lines) {
		const match = INCLUDE_DIRECTIVE.exec(line);
		if (match) targets.push(match[2]);
	}
	return targets;
}

/** Accumulateur mutable rempli ligne par ligne par `readStyleFile`. */
interface ParseState {
	fields: Partial<Record<GeometryField, RawBox>>;
	fontFields: Partial<Record<FontBearingField, FieldFontInfo>>;
	current: TrackedField | null;
	/** Sous-bloc `font:` / `symbol font:` en cours (deux tabulations), le cas échéant. */
	subBlock: 'font' | 'symbolFont' | null;
	/** Masque du champ `image`, capté par `handleImageMask` — hors périmètre pour les autres champs. */
	imageMask?: string;
}

/** Ligne ouvrant un champ racine (« \tcasting cost: ») : bascule le champ courant. */
function handleFieldOpener(line: string, state: ParseState): boolean {
	// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
	const opener = /^\t([^\t:]+?)\s*:\s*$/.exec(line);
	if (!opener) return false;
	// Le nom BRUT peut être un alias (« rule text » → « text ») : on le
	// résout avant de tester l'appartenance à GEOMETRY_FIELDS / CONTENT_WIDTH_FIELDS,
	// cf. FIELD_ALIASES.
	const name = resolveFieldName(opener[1].trim());
	const isGeometry = name !== null && GEOMETRY_FIELDS.includes(name as GeometryField);
	// `bearsFont` couvre désormais name/type/text/pt en plus de casting cost et
	// rarity : leur police est lue pour que le canvas écrive avec, pas seulement
	// pour mesurer une largeur.
	const hasFont = bearsFont(name);
	state.current = isGeometry || hasFont ? name : null;
	if (isGeometry) state.fields[name as GeometryField] ??= {};
	if (hasFont) state.fontFields[name] ??= {};
	state.subBlock = null;
	return true;
}

/**
 * Ligne à l'intérieur d'un champ porteur de police : ouvre ou peuple un
 * sous-bloc `font:` / `symbol font:` (cf. `bearsFont` pour la liste).
 */
function handleFontSubBlock(line: string, state: ParseState): boolean {
	const current = state.current as FontBearingField;
	// Un sous-bloc `font:` / `symbol font:` s'ouvre à DEUX tabulations, sans
	// valeur derrière les deux-points — même forme que les champs racine,
	// mais un niveau plus profond.
	const subOpener = /^\t\t(font|symbol font)\s*:\s*$/.exec(line);
	if (subOpener) {
		state.subBlock = subOpener[1] === 'font' ? 'font' : 'symbolFont';
		state.fontFields[current]![state.subBlock] ??= {};
		return true;
	}
	if (!state.subBlock) return false;
	// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
	const fontProp = /^\t\t\t(name|size)\s*:\s*(.+?)\s*$/.exec(line);
	if (fontProp) {
		state.fontFields[current]![state.subBlock]![fontProp[1] as 'name' | 'size'] = fontProp[2];
	}
	return true;
}

/**
 * Motif des lignes d'ancre, DÉRIVÉ de `BOX_KEYS`.
 *
 * La liste des clés était auparavant recopiée à la main dans la regex : y
 * ajouter `right`/`bottom` sans toucher à la regex les rendait invisibles,
 * `BOX_KEYS` et le motif ayant silencieusement divergé. Une seule source.
 */
const BOX_PROPERTY = new RegExp(`^\\t\\t(${BOX_KEYS.join('|')})\\s*:\\s*(.+?)\\s*$`);

/** Côtés de marge intérieure lus, dérivés de `RawPadding`. */
const PADDING_SIDES = ['top', 'left', 'right', 'bottom'] as const;
const PADDING_PROPERTY = new RegExp(
	`^\\t\\tpadding (${PADDING_SIDES.join('|')})\\s*:\\s*(.+?)\\s*$`
);
// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
const ALIGNMENT_PROPERTY = /^\t\talignment\s*:\s*(.+?)\s*$/;

/**
 * Ligne « alignment: … » ou « padding top: … » d'un champ porteur de police.
 *
 * Ces deux propriétés disent où poser le texte DANS sa boîte. Le canvas les
 * remplaçait par des constantes (+16, +36…) calibrées sur un seul gabarit, d'où
 * 125 gabarits sur 136 dont la ligne de type débordait de sa boîte.
 *
 * Même profondeur que les ancres (deux tabulations), donc lue au même endroit.
 */
function handleLayoutProperty(line: string, state: ParseState): void {
	if (!bearsFont(state.current)) return;
	const info = (state.fontFields[state.current] ??= {});
	const alignment = ALIGNMENT_PROPERTY.exec(line);
	// Une valeur vide (`alignment:` suivi de rien) n'est pas une déclaration :
	// 267 champs `text` du corpus sont dans ce cas. On ne la retient pas, sans
	// quoi elle écraserait une valeur héritée par `include file:`.
	if (alignment?.[1]) {
		info.alignment = alignment[1];
		return;
	}
	const padding = PADDING_PROPERTY.exec(line);
	if (padding) {
		info.padding ??= {};
		info.padding[padding[1] as (typeof PADDING_SIDES)[number]] = padding[2];
	}
}

/** Ligne « left/top/width/height/right/bottom: … » directement sous un champ racine. */
function handleBoxProperty(line: string, state: ParseState): void {
	const prop = BOX_PROPERTY.exec(line);
	if (!prop) return;
	if (GEOMETRY_FIELDS.includes(state.current as GeometryField)) {
		state.fields[state.current as GeometryField]![prop[1] as (typeof BOX_KEYS)[number]] = prop[2];
	}
	if (prop[1] === 'width' && CONTENT_WIDTH_FIELDS.includes(state.current as ContentWidthField)) {
		state.fontFields[state.current as ContentWidthField]!.width = prop[2];
	}
}

/**
 * Ligne « mask: … » du champ `image` UNIQUEMENT — `border_mask` et
 * `foil_mask` répondent à d'autres besoins et sont hors périmètre (cf.
 * `maskFileFrom`, partagé avec `generate-manifests.mjs` via
 * `image-mask.mjs`). Deux formes : littérale sur la même ligne, ou un
 * sous-bloc `script:` à trois tabulations quand la déclaration est pilotée
 * par script.
 */
function handleImageMask(line: string, state: ParseState): void {
	if (state.current !== 'image') return;
	const literal = IMAGE_MASK_LINE.exec(line);
	if (literal && literal[1].trim()) {
		state.imageMask = maskFileFrom(literal[1]) ?? state.imageMask;
		return;
	}
	const script = IMAGE_MASK_SCRIPT_LINE.exec(line);
	if (script) {
		state.imageMask = maskFileFrom(script[1]) ?? state.imageMask;
	}
}

/** Champs bruts d'un bloc `card style:`, sans la largeur/hauteur de carte. */
interface ParsedFields {
	fields: Partial<Record<GeometryField, RawBox>>;
	fontFields: Partial<Record<FontBearingField, FieldFontInfo>>;
	imageMask?: string;
}

/**
 * Analyse les lignes d'un bloc `card style:` (déjà découpé par
 * `cardStyleBlock`) en champs. Factorisé pour servir aussi bien au fichier
 * `style` principal qu'à chaque fichier `include file:` qu'il hérite — même
 * forme, même profondeur de tabulation.
 */
function parseCardStyleFields(lines: string[]): ParsedFields {
	const state: ParseState = { fields: {}, fontFields: {}, current: null, subBlock: null };
	for (const line of lines) {
		if (handleFieldOpener(line, state)) continue;
		if (!state.current) continue;
		// Toute ligne à deux tabulations (ou moins) referme le sous-bloc
		// précédent — d'où le test de profondeur AVANT de chercher un nouvel
		// ouvreur, plutôt qu'une fermeture au cas par cas.
		if (!line.startsWith('\t\t\t')) state.subBlock = null;
		// `handleFontSubBlock` rend `false` tant qu'aucun sous-bloc n'est ouvert :
		// les lignes d'ancre d'un champ porteur de police (name/type/text/pt ont
		// une boîte ET une police, contrairement à `casting cost`) continuent donc
		// bien jusqu'à `handleBoxProperty`.
		if (bearsFont(state.current) && handleFontSubBlock(line, state)) continue;
		handleImageMask(line, state);
		handleLayoutProperty(line, state);
		handleBoxProperty(line, state);
	}
	return { fields: state.fields, fontFields: state.fontFields, imageMask: state.imageMask };
}

/** Complète `into` avec les clés de `from` qu'il n'a pas déjà — jamais l'inverse. */
function fillMissing<T extends object>(into: T, from: T | undefined): void {
	if (!from) return;
	for (const key of Object.keys(from) as (keyof T)[]) {
		if (into[key] === undefined && from[key] !== undefined) into[key] = from[key];
	}
}

/**
 * Fusionne les boîtes (« image », « name », … ) d'un bloc HÉRITÉ dans un bloc
 * PROPRE, champ par champ puis propriété par propriété — cf. `mergeFields`.
 */
function mergeGeometryFields(own: ParsedFields, inherited: ParsedFields): void {
	for (const field of GEOMETRY_FIELDS) {
		const from = inherited.fields[field];
		if (!from) continue;
		own.fields[field] ??= {};
		fillMissing(own.fields[field], from);
	}
}

/**
 * Fusionne les blocs porteurs de police (largeur + sous-blocs `font:` /
 * `symbol font:`) — même règle de priorité que `mergeGeometryFields`.
 *
 * Parcourt l'UNION des deux ensembles : de nombreux styles ne déclarent leurs
 * polices que dans le fichier qu'ils incluent (`include file:`). S'en tenir à
 * `CONTENT_WIDTH_FIELDS` aurait laissé tomber la police héritée de
 * name/type/text/pt, c'est-à-dire précisément celle que le canvas doit écrire.
 */
const FONT_BEARING_FIELDS: readonly FontBearingField[] = [
	...new Set<FontBearingField>([...CONTENT_WIDTH_FIELDS, ...FONT_FIELDS]),
];

function mergeFontFields(own: ParsedFields, inherited: ParsedFields): void {
	for (const field of FONT_BEARING_FIELDS) {
		const from = inherited.fontFields[field];
		if (!from) continue;
		own.fontFields[field] ??= {};
		const into = own.fontFields[field];
		if (into.width === undefined && from.width !== undefined) into.width = from.width;
		// `alignment` et `padding` s'héritent comme le reste : de nombreux styles
		// ne les déclarent que dans le fichier qu'ils incluent.
		if (into.alignment === undefined && from.alignment !== undefined) {
			into.alignment = from.alignment;
		}
		if (from.padding) {
			into.padding ??= {};
			fillMissing(into.padding, from.padding);
		}
		for (const sub of ['font', 'symbolFont'] as const) {
			if (!from[sub]) continue;
			into[sub] ??= {};
			fillMissing(into[sub], from[sub]);
		}
	}
}

/**
 * Fusionne un bloc HÉRITÉ (`inherited`) dans un bloc PROPRE (`own`), sans
 * jamais écraser une valeur que `own` a déjà. La fusion est à grain FIN :
 * - par champ (« image », « name », … ) : un style qui ne définit `image`
 *   que lui-même garde quand même le `text` hérité ;
 * - par PROPRIÉTÉ dans un champ commun aux deux : si `own.name.left` existe
 *   mais que `own.name.top` est absent, seul `top` vient de `inherited`.
 * Muter `own` en place évite une recopie profonde à chaque niveau de
 * récursion (jusqu'à 4, cf. spec).
 */
function mergeFields(own: ParsedFields, inherited: ParsedFields): void {
	mergeGeometryFields(own, inherited);
	mergeFontFields(own, inherited);
	own.imageMask ??= inherited.imageMask;
}

/**
 * Lit et résout récursivement les champs d'UN fichier de style ou d'inclusion
 * (même forme : un en-tête `card style:` avec ses champs). `visited` protège
 * contre un cycle d'inclusion — aucun n'est mesuré dans le corpus (profondeur
 * max 4), mais un cycle non gardé bloquerait l'extracteur indéfiniment.
 *
 * Aucun repli : une cible d'inclusion introuvable est signalée sur la
 * console plutôt qu'ignorée en silence — cf. règle « aucun fallback », le
 * champ reste simplement absent en aval.
 */
function readFieldsWithIncludes(
	path: string,
	corpusRoot: string,
	visited: Set<string>
): ParsedFields {
	if (visited.has(path)) return { fields: {}, fontFields: {} };
	visited.add(path);

	let source: string;
	try {
		source = readFileSync(path, 'utf8');
	} catch {
		// Cible d'inclusion absente : visible plutôt que silencieuse (cf.
		// « aucun fallback »). Les 86 cibles du corpus existent toutes ; si ce
		// message apparaît, le corpus a changé et mérite d'être regardé.
		console.error(`mse-geometry: include file introuvable : ${path}`);
		return { fields: {}, fontFields: {} };
	}

	const lines = source.split('\n');
	const own = parseCardStyleFields(cardStyleBlock(lines));

	// Les propres inclusions du fichier inclus (récursion) sont résolues
	// D'ABORD, puis fusionnées dans `own` : la règle « le propre l'emporte »
	// s'applique à CHAQUE niveau, pas seulement au fichier de style final.
	for (const target of collectIncludeTargets(lines)) {
		const inherited = readFieldsWithIncludes(join(corpusRoot, target), corpusRoot, visited);
		mergeFields(own, inherited);
	}

	return own;
}

/**
 * Lit un fichier `style` de paquet MSE.
 *
 * Les valeurs sont rendues TELLES QUELLES : ce module ne sait pas évaluer, il
 * sépare seulement la structure du contenu. C'est volontaire — l'évaluation
 * demande une portée (scripts de la partie + du style) que ce niveau n'a pas.
 *
 * Attention au format : MSE écrit parfois « top : 0 » avec une espace AVANT le
 * deux-points. Une regex qui exige « top: » perd silencieusement le champ.
 *
 * `corpusRoot` sert à résoudre les `include file:` : leur chemin est ABSOLU
 * au sein du corpus (ex. `/magic-modules.mse-include/corners/card_fields`),
 * donc relatif à sa racine, jamais au fichier qui inclut. 255 des 376 styles
 * (67 %) en contiennent au moins un dans leur bloc `card style:` — sans les
 * suivre, les champs qu'un style HÉRITE plutôt que définit lui-même restent
 * invisibles, ce qui disqualifiait à tort la plupart des gabarits.
 */
export function readStyleFile(path: string, corpusRoot: string): StyleFile | null {
	let source: string;
	try {
		source = readFileSync(path, 'utf8');
	} catch {
		return null;
	}
	const width = /^card width:\s*([\d.]+)/m.exec(source);
	const height = /^card height:\s*([\d.]+)/m.exec(source);
	if (!width || !height) return null;

	const lines = source.split('\n');
	const own = parseCardStyleFields(cardStyleBlock(lines));

	// Même logique de priorité qu'en récursion : le fichier de style l'emporte
	// sur tout ce qu'il inclut, quel que soit le nombre de cibles.
	const visited = new Set<string>([path]);
	for (const target of collectIncludeTargets(lines)) {
		const inherited = readFieldsWithIncludes(join(corpusRoot, target), corpusRoot, visited);
		mergeFields(own, inherited);
	}

	return {
		id: basename(dirname(path)).replace(/\.mse-style$/, ''),
		cardWidth: Number(width[1]),
		cardHeight: Number(height[1]),
		fields: own.fields,
		fontFields: own.fontFields,
		imageMask: own.imageMask,
	};
}
