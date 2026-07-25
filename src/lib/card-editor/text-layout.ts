export interface CardTextLine {
	text: string;
	isParagraphEnd: boolean;
}

function wrapParagraph(paragraph: string, maxCharacters: number): string[] {
	const words = paragraph.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= maxCharacters || !current) current = candidate;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

export function wrapCardText(
	text: string,
	maxCharacters: number,
	maxLines: number
): CardTextLine[] {
	const paragraphs = text.replace(/\r/g, '').split('\n');
	const lines: CardTextLine[] = [];
	for (const paragraph of paragraphs) {
		const wrapped = wrapParagraph(paragraph, maxCharacters);
		wrapped.forEach((line, index) => {
			lines.push({ text: line, isParagraphEnd: index === wrapped.length - 1 });
		});
	}
	if (lines.length <= maxLines) return lines;
	const clipped = lines.slice(0, maxLines);
	const last = clipped[maxLines - 1];
	while (last.text.endsWith('.') || last.text.endsWith('…')) {
		last.text = last.text.slice(0, -1);
	}
	last.text = `${last.text}…`;
	return clipped;
}

export function getRulesFontSize(characterCount: number, isNarrow: boolean): number {
	if (isNarrow) {
		if (characterCount > 520) return 17;
		if (characterCount > 340) return 19;
		return 21;
	}
	if (characterCount > 650) return 18;
	if (characterCount > 440) return 20;
	if (characterCount > 260) return 23;
	return 26;
}

/** Corps du titre à pleine taille, avant toute réduction. */
const TITLE_MAX_FONT_SIZE = 33;
/**
 * Plancher de lisibilité. En dessous, le nom devient illisible à la taille
 * d'impression réelle ; on préfère le tronquer (cf. fitTitle) que le rapetisser
 * indéfiniment.
 */
const TITLE_MIN_FONT_SIZE = 19;
/**
 * Largeur moyenne d'un glyphe en fraction du corps, pour du Georgia gras.
 * Empirique mais stable : la mesure exacte demanderait un canvas, indisponible
 * pendant le rendu SVG côté serveur.
 */
const TITLE_GLYPH_RATIO = 0.505;

export interface FittedTitle {
	text: string;
	fontSize: number;
}

/**
 * Ajuste le titre à la largeur disponible.
 *
 * Une carte imprimée réserve ~52-53 mm à la ligne de nom, coût de mana déduit,
 * ce qui absorbe environ 30 à 33 caractères avant que le corps ne diminue.
 * `availableWidth` doit donc être la largeur de la zone titre MOINS celle
 * qu'occupent les symboles de mana : sinon un nom long passe sous le coût.
 *
 * Deux étapes, dans l'ordre de ce que fait une vraie carte :
 *  1. réduire le corps jusqu'au plancher de lisibilité ;
 *  2. si ça ne suffit toujours pas, tronquer avec une ellipse.
 */
export function fitTitle(title: string, availableWidth: number): FittedTitle {
	if (!title) return { text: title, fontSize: TITLE_MAX_FONT_SIZE };

	const widthAt = (size: number, characters: number) => characters * size * TITLE_GLYPH_RATIO;

	if (widthAt(TITLE_MAX_FONT_SIZE, title.length) <= availableWidth) {
		return { text: title, fontSize: TITLE_MAX_FONT_SIZE };
	}

	const ideal = availableWidth / (title.length * TITLE_GLYPH_RATIO);
	if (ideal >= TITLE_MIN_FONT_SIZE) {
		return { text: title, fontSize: Math.floor(ideal) };
	}

	// Même au plancher le nom ne rentre pas : on tronque sur le nombre de
	// caractères que cette taille autorise, ellipse comprise.
	const maxCharacters = Math.max(
		1,
		Math.floor(availableWidth / (TITLE_MIN_FONT_SIZE * TITLE_GLYPH_RATIO)) - 1
	);
	return { text: `${title.slice(0, maxCharacters).trimEnd()}…`, fontSize: TITLE_MIN_FONT_SIZE };
}

export function getManaSymbols(manaCost: string): string[] {
	return manaCost
		.split('{')
		.slice(1)
		.map((part) => part.split('}', 1)[0]?.trim().toUpperCase())
		.filter((symbol): symbol is string => Boolean(symbol));
}

export function expandCardNameShortcut(text: string, cardName: string): string {
	return text.replaceAll('~', cardName || 'CARDNAME');
}

/**
 * URL same-origin d'un symbole de mana, à partir de son svg_uri Scryfall.
 *
 * Le canvas ne peut pas pointer vers svgs.scryfall.io directement : ce CDN ne
 * renvoie pas d'en-tête CORS, et l'export PNG doit pouvoir LIRE le SVG pour
 * l'inliner. On route donc par /api/scryfall/symbol/<code>, qui le sert depuis
 * notre origine (cf. la route du même nom).
 *
 * Retourne null si l'URL amont n'a pas la forme attendue, ce qui laisse
 * l'appelant retomber sur son rendu de repli.
 */
export function manaSymbolProxyUrl(svgUri: string | undefined): string | null {
	if (!svgUri) return null;
	const code = /\/card-symbols\/([A-Za-z0-9]{1,4})\.svg$/.exec(svgUri)?.[1];
	return code ? `/api/scryfall/symbol/${code}` : null;
}
