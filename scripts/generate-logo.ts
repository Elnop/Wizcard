/**
 * generate-logo.ts — Génère les artefacts binaires du logo Wizcard.
 *
 * Lancé via `npm run logo:generate`. Extrait le contour du glyphe « W » de la
 * police de marque White on Black (opentype.js) et produit :
 *   - public/logo.svg      (W vectorisé en <path>, or sur fond sombre)
 *   - src/app/favicon.ico  (multi-résolution 16/32/48, via sharp — Task 6)
 *
 * Rendu identique partout : le W est figé en <path>, indépendant de la police
 * installée chez le lecteur.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

const GOLD = '#c9a84c';
const BG = '#0a0a0a';
const FONT_PATH = join(process.cwd(), 'src/fonts/brand/white-on-black.ttf');

// opentype.js v2's `loadSync` is a deprecated no-op stub in this install (logs
// a warning and returns undefined) — parse the buffer directly instead, per
// the library's own deprecation message.
const font = opentype.parse(readFileSync(FONT_PATH));

/**
 * Construit un SVG carré px×px : fond sombre + glyphe « W » or centré.
 * Le glyphe est dessiné à une taille de police qui le fait tenir dans ~72% du
 * canevas, puis recentré via sa bounding box réelle.
 */
function buildGlyphSvg(px: number): string {
	const fontSize = px * 0.8;
	// getPath(text, x, y, fontSize) : y est la ligne de base.
	const probe = font.getPath('W', 0, 0, fontSize);
	const bb = probe.getBoundingBox(); // {x1,y1,x2,y2}
	const glyphW = bb.x2 - bb.x1;
	const glyphH = bb.y2 - bb.y1;
	const x = (px - glyphW) / 2 - bb.x1;
	const y = (px - glyphH) / 2 - bb.y1;
	const path = font.getPath('W', x, y, fontSize);
	const d = path.toPathData(2);
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">`,
		`<rect width="${px}" height="${px}" fill="${BG}"/>`,
		`<path d="${d}" fill="${GOLD}"/>`,
		`</svg>`,
	].join('');
}

function writeLogoSvg(): void {
	const svg = buildGlyphSvg(512);
	writeFileSync(join(process.cwd(), 'public/logo.svg'), svg + '\n');
	console.log('✓ public/logo.svg');
}

writeLogoSvg();

export { buildGlyphSvg };
