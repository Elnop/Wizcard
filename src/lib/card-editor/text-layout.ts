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

export function getTitleFontSize(characterCount: number): number {
	if (characterCount > 34) return 25;
	if (characterCount > 25) return 29;
	return 33;
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
