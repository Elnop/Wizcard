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
 * Largeur par glyphe, en fraction du corps, pour du Georgia gras.
 *
 * Une moyenne unique ne marche PAS : mesuré dans le SVG, un « W » vaut 1.0 et un
 * « i » 0.278 — un facteur 3.6. Avec une moyenne à ~0.5, « WWWWWWWWWWWWWWWWWW »
 * était estimé deux fois trop étroit et débordait avant que la réduction ne se
 * déclenche.
 *
 * On classe donc les caractères par gabarit. Valeurs relevées sur le rendu réel
 * (getBBox sur un <text> Georgia 800), arrondies à la hausse pour que
 * l'estimation reste conservatrice — mieux vaut réduire un peu tôt que déborder.
 */
const GLYPH_WIDTHS = {
	/** W, M et l'ellipse : les plus larges de la fonte (mesurés à 1.0). */
	widest: 1.0,
	/** Majuscules larges (A ≈ 0.72, E ≈ 0.67) et minuscules m/w. */
	wide: 0.78,
	/** Minuscules ordinaires (o ≈ 0.5) et chiffres. */
	normal: 0.55,
	/** Lettres étroites (I ≈ 0.39, t ≈ 0.33) et ponctuation (, ≈ 0.25). */
	narrow: 0.4,
	/** Espace : getBBox le mesure à 0, mais il avance bien le curseur. */
	space: 0.25,
} as const;

function glyphWidth(character: string): number {
	if (character === ' ') return GLYPH_WIDTHS.space;
	if (/[WM…]/.test(character)) return GLYPH_WIDTHS.widest;
	if (/[IiltfjJ.,;:'"!|\-()[\]]/.test(character)) return GLYPH_WIDTHS.narrow;
	if (/[A-HK-Zmw@#%&]/.test(character)) return GLYPH_WIDTHS.wide;
	return GLYPH_WIDTHS.normal;
}

/**
 * Marge de sécurité (2%) sur la largeur estimée.
 *
 * Le classement par gabarit surestime la plupart des textes, mais tombe PILE sur
 * une chaîne de « W » (mesuré : 594 estimé vs 594 réel à corps 33). Sans marge,
 * un arrondi défavorable ou une substitution de fonte suffit à déborder d'un
 * poil. 2% coûte moins d'un caractère sur un titre courant.
 */
const TITLE_SAFETY_MARGIN = 1.02;

/** Largeur estimée d'une chaîne à un corps donné, en unités SVG. */
function measureTitle(text: string, fontSize: number): number {
	let total = 0;
	for (const character of text) total += glyphWidth(character);
	return total * fontSize * TITLE_SAFETY_MARGIN;
}

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
 *  2. si ça ne suffit toujours pas, couper net (pas d'ellipse : une carte
 *     imprimée n'en met pas).
 */
export function fitTitle(title: string, availableWidth: number): FittedTitle {
	if (!title) return { text: title, fontSize: TITLE_MAX_FONT_SIZE };

	// Largeur à corps 1 : la largeur à n'importe quel corps s'en déduit par
	// produit, ce qui donne le corps idéal sans boucler.
	const unitWidth = measureTitle(title, 1);
	if (unitWidth * TITLE_MAX_FONT_SIZE <= availableWidth) {
		return { text: title, fontSize: TITLE_MAX_FONT_SIZE };
	}

	const ideal = Math.floor(availableWidth / unitWidth);
	if (ideal >= TITLE_MIN_FONT_SIZE) {
		return { text: title, fontSize: ideal };
	}

	// Même au plancher le nom ne rentre pas : on coupe net, SANS ellipse — une
	// vraie carte n'en met pas, et le « … » prenait en plus la largeur d'un W.
	// Boucle sur les glyphes réels, car couper « WWWW » et couper « iiii » ne
	// libèrent pas la même largeur.
	let text = title;
	while (text.length > 1 && measureTitle(text, TITLE_MIN_FONT_SIZE) > availableWidth) {
		text = text.slice(0, -1);
	}
	return { text: text.trimEnd(), fontSize: TITLE_MIN_FONT_SIZE };
}

export function getManaSymbols(manaCost: string): string[] {
	return manaCost
		.split('{')
		.slice(1)
		.map((part) => part.split('}', 1)[0]?.trim().toUpperCase())
		.filter((symbol): symbol is string => Boolean(symbol));
}

/**
 * Nombre maximal de pips (symboles) dans un coût de mana.
 *
 * 17 est la limite retenue : au-delà les symboles ne tiennent plus sur la ligne
 * de titre, et aucune carte réelle n'en approche. Le générique compte pour UN
 * pip quelle que soit sa valeur — {15} est un seul symbole dessiné.
 */
export const MAX_MANA_PIPS = 17;

/**
 * Tronque un coût de mana à MAX_MANA_PIPS symboles, en préservant la syntaxe.
 *
 * On reconstruit depuis les symboles reconnus plutôt que de couper la chaîne :
 * un `slice` brut pourrait laisser une accolade orpheline ({W}{U}{ ), que le
 * parseur retomberait ensuite silencieusement.
 */
export function clampManaCost(manaCost: string): string {
	const symbols = getManaSymbols(manaCost);
	if (symbols.length <= MAX_MANA_PIPS) return manaCost;
	return symbols
		.slice(0, MAX_MANA_PIPS)
		.map((symbol) => `{${symbol}}`)
		.join('');
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
