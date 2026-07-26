import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Les zones dont le studio a besoin. Tout autre bloc du style est ignoré. */
export const GEOMETRY_FIELDS = ['image', 'name', 'type', 'text', 'pt', 'casting cost'] as const;
export type GeometryField = (typeof GEOMETRY_FIELDS)[number];

/**
 * Champs supplémentaires lus pour `content_width` (tâche 6) : « rarity » n'est
 * pas une boîte que le studio dessine (absente de GEOMETRY_FIELDS), mais son
 * bloc doit quand même être lu pour calculer la largeur que d'AUTRES champs
 * référencent via `card_style.rarity.content_width`.
 */
const CONTENT_WIDTH_FIELDS = ['casting cost', 'rarity'] as const;
type ContentWidthField = (typeof CONTENT_WIDTH_FIELDS)[number];
type TrackedField = GeometryField | ContentWidthField;

/** Valeurs BRUTES : un nombre (« 29 ») ou une expression (« { max(30, …) } »). */
export interface RawBox {
	left?: string;
	top?: string;
	width?: string;
	height?: string;
}

/** Un sous-bloc `font:` / `symbol font:` : nom et taille, tels qu'écrits dans le style. */
export interface RawFont {
	name?: string;
	size?: string;
}

/** Ce dont un champ a besoin pour que `content_width` soit mesurable (tâche 6). */
export interface FieldFontInfo {
	width?: string;
	font?: RawFont;
	symbolFont?: RawFont;
}

export interface StyleFile {
	/** Nom du paquet sans le suffixe, ex. « magic-m15 ». */
	id: string;
	cardWidth: number;
	cardHeight: number;
	fields: Partial<Record<GeometryField, RawBox>>;
	/** Polices déclarées pour `casting cost` / `rarity`, cf. FieldFontInfo. */
	fontFields: Partial<Record<ContentWidthField, FieldFontInfo>>;
}

const BOX_KEYS = ['left', 'top', 'width', 'height'] as const;

/**
 * Découpe le bloc `card style:` : ses enfants sont indentés d'UNE tabulation,
 * leurs propriétés de deux. On s'arrête à la première ligne non indentée, qui
 * ouvre la section suivante du fichier.
 */
function cardStyleBlock(lines: string[]): string[] {
	const start = lines.findIndex((line) => line.trimEnd().startsWith('card style:'));
	if (start === -1) return [];
	const block: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && !line.startsWith('\t')) break;
		block.push(line);
	}
	return block;
}

/** Accumulateur mutable rempli ligne par ligne par `readStyleFile`. */
interface ParseState {
	fields: Partial<Record<GeometryField, RawBox>>;
	fontFields: Partial<Record<ContentWidthField, FieldFontInfo>>;
	current: TrackedField | null;
	/** Sous-bloc `font:` / `symbol font:` en cours (deux tabulations), le cas échéant. */
	subBlock: 'font' | 'symbolFont' | null;
}

/** Ligne ouvrant un champ racine (« \tcasting cost: ») : bascule le champ courant. */
function handleFieldOpener(line: string, state: ParseState): boolean {
	// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
	const opener = /^\t([^\t:]+?)\s*:\s*$/.exec(line);
	if (!opener) return false;
	const name = opener[1].trim() as TrackedField;
	const isGeometry = GEOMETRY_FIELDS.includes(name as GeometryField);
	const isContentWidth = CONTENT_WIDTH_FIELDS.includes(name as ContentWidthField);
	state.current = isGeometry || isContentWidth ? name : null;
	if (isGeometry) state.fields[name as GeometryField] ??= {};
	if (isContentWidth) state.fontFields[name as ContentWidthField] ??= {};
	state.subBlock = null;
	return true;
}

/**
 * Ligne à l'intérieur d'un champ « casting cost » / « rarity » : ouvre ou
 * peuple un sous-bloc `font:` / `symbol font:`. Un sous-bloc ne concerne QUE
 * ces deux champs — cf. FieldFontInfo, seule structure qui les porte.
 */
function handleFontSubBlock(line: string, state: ParseState): boolean {
	const current = state.current as ContentWidthField;
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

/** Ligne « left/top/width/height: … » directement sous un champ racine. */
function handleBoxProperty(line: string, state: ParseState): void {
	// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
	const prop = /^\t\t(left|top|width|height)\s*:\s*(.+?)\s*$/.exec(line);
	if (!prop) return;
	if (GEOMETRY_FIELDS.includes(state.current as GeometryField)) {
		state.fields[state.current as GeometryField]![prop[1] as (typeof BOX_KEYS)[number]] = prop[2];
	}
	if (prop[1] === 'width' && CONTENT_WIDTH_FIELDS.includes(state.current as ContentWidthField)) {
		state.fontFields[state.current as ContentWidthField]!.width = prop[2];
	}
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
 */
export function readStyleFile(path: string): StyleFile | null {
	let source: string;
	try {
		source = readFileSync(path, 'utf8');
	} catch {
		return null;
	}
	const lines = source.split('\n');
	const width = /^card width:\s*([\d.]+)/m.exec(source);
	const height = /^card height:\s*([\d.]+)/m.exec(source);
	if (!width || !height) return null;

	const state: ParseState = { fields: {}, fontFields: {}, current: null, subBlock: null };
	for (const line of cardStyleBlock(lines)) {
		if (handleFieldOpener(line, state)) continue;
		if (!state.current) continue;
		// Toute ligne à deux tabulations (ou moins) referme le sous-bloc
		// précédent — d'où le test de profondeur AVANT de chercher un nouvel
		// ouvreur, plutôt qu'une fermeture au cas par cas.
		if (!line.startsWith('\t\t\t')) state.subBlock = null;
		const isContentWidthField = CONTENT_WIDTH_FIELDS.includes(state.current as ContentWidthField);
		if (isContentWidthField && handleFontSubBlock(line, state)) continue;
		handleBoxProperty(line, state);
	}

	return {
		id: basename(dirname(path)).replace(/\.mse-style$/, ''),
		cardWidth: Number(width[1]),
		cardHeight: Number(height[1]),
		fields: state.fields,
		fontFields: state.fontFields,
	};
}
