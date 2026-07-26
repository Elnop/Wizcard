import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Les zones dont le studio a besoin. Tout autre bloc du style est ignoré. */
export const GEOMETRY_FIELDS = ['image', 'name', 'type', 'text', 'pt', 'casting cost'] as const;
export type GeometryField = (typeof GEOMETRY_FIELDS)[number];

/** Valeurs BRUTES : un nombre (« 29 ») ou une expression (« { max(30, …) } »). */
export interface RawBox {
	left?: string;
	top?: string;
	width?: string;
	height?: string;
}

export interface StyleFile {
	/** Nom du paquet sans le suffixe, ex. « magic-m15 ». */
	id: string;
	cardWidth: number;
	cardHeight: number;
	fields: Partial<Record<GeometryField, RawBox>>;
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

	const fields: Partial<Record<GeometryField, RawBox>> = {};
	let current: GeometryField | null = null;
	for (const line of cardStyleBlock(lines)) {
		// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
		const opener = /^\t([^\t:]+?)\s*:\s*$/.exec(line);
		if (opener) {
			const name = opener[1].trim() as GeometryField;
			current = GEOMETRY_FIELDS.includes(name) ? name : null;
			if (current) fields[current] ??= {};
			continue;
		}
		if (!current) continue;
		// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
		const prop = /^\t\t(left|top|width|height)\s*:\s*(.+?)\s*$/.exec(line);
		if (prop) fields[current]![prop[1] as (typeof BOX_KEYS)[number]] = prop[2];
	}

	return {
		id: basename(dirname(path)).replace(/\.mse-style$/, ''),
		cardWidth: Number(width[1]),
		cardHeight: Number(height[1]),
		fields,
	};
}
