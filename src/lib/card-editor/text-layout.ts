export interface CardTextLine {
	text: string;
	isParagraphEnd: boolean;
}

/**
 * Longueur « visuelle » d'un mot, en équivalents-caractères.
 *
 * Le retour à la ligne compte des caractères, mais un symbole comme {T} en
 * occupe 3 dans la chaîne pour la largeur d'environ 1.5 : sans correction, une
 * ligne pleine de symboles se coupe beaucoup trop tôt. On remplace donc chaque
 * groupe {…} par sa largeur approchée avant de compter.
 */
const SYMBOL_CHAR_EQUIVALENT = 1.5;

function visualLength(text: string): number {
	const symbols = text.match(/\{[^{}]+\}/g) ?? [];
	const symbolChars = symbols.reduce((sum, symbol) => sum + symbol.length, 0);
	return text.length - symbolChars + symbols.length * SYMBOL_CHAR_EQUIVALENT;
}

function wrapParagraph(paragraph: string, maxCharacters: number): string[] {
	const words = paragraph.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [''];
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (visualLength(candidate) <= maxCharacters || !current) current = candidate;
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
	// Débordement : on coupe net aux lignes disponibles, SANS ellipse — une carte
	// imprimée n'en met pas, et le « … » consommait en plus la largeur d'un W.
	// (La saisie est de toute façon bornée par la capacité du layout en amont ;
	// ce garde-fou ne joue plus que pour un contenu hérité.)
	return lines.slice(0, maxLines);
}

/**
 * Découpe un texte en lignes à la LARGEUR, italiques comprises.
 *
 * `wrapCardText` compte des caractères, ce qui suppose une largeur moyenne
 * unique. Or une carte imprimée met plus de texte sur une ligne en italique,
 * qui est plus étroite : sur who/159 la ligne du texte de rappel porte 57
 * caractères là où les lignes romaines en portent 48 à 50. En comptant des
 * caractères on plafonnait à 47 partout, d'où une ligne de règles de trop et un
 * corps rabaissé pour la loger.
 *
 * Mesure chaque mot avec le style qu'il aura VRAIMENT, en consultant les plages
 * d'italique (cf. `italicRanges`) à sa position dans le texte.
 */
export function wrapCardTextByWidth(
	text: string,
	maxWidth: number,
	fontSize: number,
	italics: Array<[number, number]> = []
): CardTextLine[] {
	const isItalicAt = (index: number) =>
		italics.some(([start, end]) => index >= start && index < end);

	const lines: CardTextLine[] = [];
	let cursor = 0;
	for (const paragraph of text.replace(/\r/g, '').split('\n')) {
		const wrapped: string[] = [];
		let current = '';
		let currentWidth = 0;
		// Parcourt les mots en gardant leur position absolue, pour savoir lesquels
		// tombent dans une plage italique.
		for (const match of paragraph.matchAll(/\S+/g)) {
			const word = match[0];
			const at = cursor + (match.index ?? 0);
			const width = segmentWidth(word, at, fontSize, isItalicAt);
			const spaceWidth = current ? measureText(' ', fontSize, false) : 0;
			if (current && currentWidth + spaceWidth + width > maxWidth) {
				wrapped.push(current);
				current = word;
				currentWidth = width;
			} else {
				current = current ? `${current} ${word}` : word;
				currentWidth += spaceWidth + width;
			}
		}
		if (current) wrapped.push(current);
		if (wrapped.length === 0) wrapped.push('');
		wrapped.forEach((line, index) => {
			lines.push({ text: line, isParagraphEnd: index === wrapped.length - 1 });
		});
		cursor += paragraph.length + 1;
	}
	return lines;
}

/**
 * Largeur d'un mot, chaque caractère mesuré dans le style qu'il aura.
 *
 * Un mot peut chevaucher une frontière d'italique (« Lord »/« — »), donc la
 * mesure se fait caractère par caractère plutôt qu'en bloc.
 */
function segmentWidth(
	word: string,
	at: number,
	fontSize: number,
	isItalicAt: (index: number) => boolean
): number {
	let total = 0;
	let index = at;
	for (const char of word) {
		total += measureText(char, fontSize, false, isItalicAt(index));
		index += char.length;
	}
	return total;
}

/**
 * Corps de la ligne de type, réduit pour ne pas passer sous le symbole.
 *
 * La ligne de type était rendue BRUTE, au corps mesuré : « Créature légendaire
 * — time lord et docteur » débordait sous le symbole d'édition, qui s'imprime
 * à droite du même bandeau. MSE fait la même chose — il rétrécit la boîte de
 * type PAR la largeur du symbole (cf. le commentaire de `SetMark`) — donc on
 * réduit le corps au lieu de laisser déborder.
 *
 * Pas de troncature ni de plancher de lisibilité, contrairement à `fitTitle` :
 * une ligne de type est courte et doit rester ENTIÈRE. Elle rétrécit, point.
 */
export function fitTypeLineFontSize(
	typeLine: string,
	availableWidth: number,
	fontSize: number
): number {
	if (!typeLine || availableWidth <= 0) return fontSize;
	// Marge de sécurité : même principe que `TITLE_SAFETY_MARGIN`. Notre table de
	// glyphes reste une approximation (erreur résiduelle mesurée jusqu'à 7 % sur
	// une phrase de carte, même après recalibrage sur MPlantin), et une
	// sous-estimation fait passer la ligne SOUS le symbole d'édition plutôt que
	// de s'arrêter avant.
	const width = measureText(typeLine, fontSize, false) * TYPE_LINE_SAFETY_MARGIN;
	if (width <= availableWidth) return fontSize;
	return fontSize * (availableWidth / width);
}

/** Cf. `fitTypeLineFontSize` : couvre l'erreur résiduelle de GLYPH_WIDTHS. */
const TYPE_LINE_SAFETY_MARGIN = 1.08;

/**
 * Largeur moyenne d'un caractère de règles, en fraction du corps.
 *
 * Sert à estimer combien de caractères tiennent sur une ligne, donc combien de
 * lignes occupe un texte — et par là le corps auquel il tient dans la boîte.
 *
 * RECALIBRÉ le 2026-09-26 : la valeur était 0.53, qui sous-estimait de 26 % le
 * nombre de caractères par ligne. Conséquence visible : `fitRulesFontSize`
 * croyait qu'il fallait 9 lignes là où la carte imprimée en met 6, et
 * rabaissait le corps à 73 % du corps MESURÉ — le texte du studio était deux
 * fois plus petit que sur l'imprimé (hauteur de glyphe 0.86 % de la carte
 * contre 1.74 % mesuré sur who/159).
 *
 * Calibré sur le DÉCOUPAGE de la carte imprimée, pas sur une mesure de police :
 * c'est ce découpage qu'on cherche à reproduire. Mesuré au pixel sur who/159,
 * deux lignes romaines de 49 et 50 caractères occupent 527 et 539 px pour un
 * corps de 25.0 px — soit 0.4299 et 0.4309 par caractère.
 *
 * La ligne du texte de rappel, en italique, tombe à 0.367 : c'est pourquoi le
 * découpage passe par `wrapCardTextByWidth`, qui mesure chaque mot dans son
 * style réel, plutôt que par un nombre de caractères unique.
 */
export const RULES_CHAR_WIDTH_RATIO = 0.43;

/**
 * Hauteur perdue en haut et en bas de la boîte de texte, en fraction du corps.
 *
 * La première ligne ne s'écrit pas sur le bord : sa ligne de base descend d'une
 * ascendante, et une marge équivalente reste sous la dernière. C'est la version
 * PROPORTIONNELLE d'un `- 46` codé en dur qui traînait ici — une constante en
 * pixels sur une grandeur qui suit le corps, donc juste pour un seul corps et
 * fausse partout ailleurs. À corps plein elle volait une ligne et demie, ce qui
 * poussait `fitRulesFontSize` à rétrécir sans raison.
 *
 * 1.2 = ~1 ascendante en haut + une marge comparable en bas, ce qui reproduit
 * le `+34` du rendu au corps mesuré de M15 (34 / 27.81 ≈ 1.22).
 */
export const RULES_VERTICAL_PADDING_RATIO = 1.2;

export interface RulesCapacity {
	/** Caractères tenant sur une ligne au corps le plus petit. */
	charactersPerLine: number;
	/** Lignes tenant dans la zone au corps le plus petit. */
	lines: number;
	/** Produit des deux : plafond de saisie utile. */
	total: number;
}

/**
 * Capacité de la zone de texte, en lignes × caractères par ligne.
 *
 * Un plafond exprimé en NOMBRE DE CARACTÈRES ne veut rien dire ici : la zone de
 * règles varie de 350×738 (saga) à 604×100 (jeton), soit de 116 à 1023
 * caractères utiles. Une borne unique était donc soit absurdement large pour un
 * jeton, soit trop courte pour une saga.
 *
 * Le calcul reprend celui du rendu (cf. RulesText), au corps MINIMAL : c'est la
 * taille qui accepte le plus de texte, donc la capacité réelle avant troncature.
 */
export function getRulesCapacity(width: number, height: number): RulesCapacity {
	const isNarrow = width < 500;
	const fontSize = isNarrow ? 17 : 18;
	const lineHeight = fontSize * DEFAULT_LINE_HEIGHT_RATIO;
	const charactersPerLine = Math.max(
		15,
		Math.floor((width - 44) / (fontSize * RULES_CHAR_WIDTH_RATIO))
	);
	const lines = Math.max(
		2,
		Math.floor((height - fontSize * RULES_VERTICAL_PADDING_RATIO) / lineHeight)
	);
	return { charactersPerLine, lines, total: charactersPerLine * lines };
}

/**
 * Corps du texte de règles : le corps MESURÉ, rétréci juste ce qu'il faut pour
 * que le texte tienne dans sa boîte.
 *
 * C'est la règle du corpus, pas une invention : le champ `text` déclare à la
 * fois `size: 14` et `scale down to: 6` — un corps plein ET un plancher de
 * rétrécissement. Une carte au texte court s'imprime donc à 14, une carte
 * bavarde descend, exactement comme ici.
 *
 * L'estimation du nombre de lignes reprend celle du rendu (cf. `RulesText`) :
 * largeur utile ÷ largeur moyenne d'un glyphe, puis hauteur ÷ interligne. Elle
 * est approximative — le rendu réel fait un vrai retour à la ligne par mot —
 * mais elle sert seulement à choisir un corps, et l'erreur va dans le sens sûr
 * (on sous-estime la capacité, donc on rétrécit un peu trop tôt plutôt que de
 * déborder).
 */
export function fitRulesFontSize(
	measuredSize: number,
	rules: string,
	flavor: string,
	rect: { width: number; height: number; usableWidth?: number },
	isNarrow: boolean,
	lineHeightRatio = DEFAULT_LINE_HEIGHT_RATIO
): number {
	const floor = measuredSize * RULES_SCALE_DOWN_FLOOR;
	// La largeur utile vient de l'appelant quand il la connaît : le canvas la
	// dérive du padding déclaré par le corpus (`left: 6`), pas d'une constante.
	// Mesuré sur l'imprimé who/159, l'encre court jusqu'à 97 % de la boîte — le
	// `- 44` en dur en retirait 7 %, soit deux caractères par ligne.
	const usableWidth = rect.usableWidth ?? rect.width - (isNarrow ? 28 : 44);
	for (let size = measuredSize; size > floor; size -= 0.5) {
		if (rulesBlockFits(rules, flavor, size, usableWidth, rect.height, lineHeightRatio)) return size;
	}
	return floor;
}

/**
 * Interligne de repli, en fraction du corps.
 *
 * Ne sert qu'aux gabarits sans police mesurée : dès que le corpus livre le TTF,
 * l'interligne vient de `ascent + descent` (cf. `CardTextFont.lineHeightRatio`).
 * L'ancien 1.28 était appliqué à TOUS les gabarits, y compris ceux dont la
 * police dit 0.999 — le bloc de texte était étiré de 28 % et le corps rabaissé
 * d'autant pour tenir dans la boîte.
 */
export const DEFAULT_LINE_HEIGHT_RATIO = 1.28;

/**
 * Le bloc règles + ambiance tient-il à ce corps ?
 *
 * Le compte se fait sur les lignes RÉELLEMENT produites par le retour à la
 * ligne, pas sur `caractères / caractères-par-ligne`. L'estimation supposait un
 * remplissage parfait alors que la coupure se fait aux mots : sur « Le Sixième
 * Docteur » elle prévoyait 9 lignes là où le rendu en produit 10, et la
 * dernière ligne d'ambiance (« ! » et guillemet fermant compris) était coupée.
 *
 * Reproduit la même arithmétique que le rendu (`RulesText`) — interligne de la
 * police, saut de paragraphe, ambiance décalée et d'un corps plus petit — pour
 * que « ça tient » ici signifie la même chose que là-bas.
 */
function rulesBlockFits(
	rules: string,
	flavor: string,
	size: number,
	usableWidth: number,
	height: number,
	lineHeightRatio: number
): boolean {
	const lineHeight = size * lineHeightRatio;
	const available = Math.max(
		1,
		Math.floor((height - size * RULES_VERTICAL_PADDING_RATIO) / lineHeight)
	);
	// Découpe à la LARGEUR et non au nombre de caractères, exactement comme le
	// rendu : une ligne en italique porte plus de texte, et l'ignorer faisait
	// compter une ligne de règles de trop.
	const ruleLines = wrapCardTextByWidth(rules, usableWidth, size, italicRanges(rules));
	// Hauteur en lignes : la première en vaut une, chaque suivante une de plus —
	// 1.28 quand la précédente terminait un paragraphe, comme au rendu.
	let ruleHeight = 1;
	for (let index = 1; index < ruleLines.length; index += 1) {
		ruleHeight += ruleLines[index - 1].isParagraphEnd ? 1.28 : 1;
	}
	if (!flavor) return ruleHeight <= available;

	const flavorSize = Math.max(17, size - 2);
	// L'ambiance est italique d'un bout à l'autre.
	const flavorLines = wrapCardTextByWidth(flavor, usableWidth, flavorSize, [
		[0, flavor.length],
	]).length;
	// L'ambiance commence 1.3 interligne SOUS la dernière ligne de règles (c'est
	// le décalage qu'applique le rendu, séparateur compris). `ruleHeight` compte
	// déjà cette dernière ligne et `flavorLines` la première d'ambiance, donc le
	// supplément est de 0.3 — compter 1.3 facturait une ligne fantôme et faisait
	// rétrécir le corps pour rien.
	//
	// Vérifié sur l'imprimé (who/159) : le saut entre la dernière ligne de règles
	// et la première d'ambiance y vaut 1.68 interligne, contre 1.3 ici — l'écart
	// restant tient à la police d'ambiance, plus petite.
	return ruleHeight + 0.3 + flavorLines <= available;
}

/**
 * Plancher de rétrécissement, en fraction du corps déclaré.
 *
 * Le corpus écrit `scale down to: 6` pour un `size: 14`, soit 0.43. La valeur
 * est reprise telle quelle plutôt que codée en absolu : les gabarits déclarent
 * des corps différents (6.93 à 32), et un plancher absolu de 6 serait déjà
 * au-dessus du corps plein des plus petits.
 */
const RULES_SCALE_DOWN_FLOOR = 6 / 14;

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

/**
 * Facteur de graisse pour le texte de règles.
 *
 * GLYPH_WIDTHS est calibrée sur du Georgia **gras** (le titre). Le texte de
 * règles est en romain, nettement plus étroit : sans correction, l'estimation
 * dépassait le réel et les segments posés APRÈS un symbole dérivaient
 * visiblement vers la droite.
 *
 * RECALIBRÉ le 2026-09-26 sur MPlantin, la police que le corpus déclare et que
 * le canvas rend réellement — l'ancien 0.79 venait de Georgia, qui n'est plus
 * qu'un repli. Mesuré dans le navigateur (`getComputedTextLength` sur dix
 * phrases de carte, majuscules et minuscules comprises) : rapport moyen 0.8889
 * contre notre table brute. À 0.79 l'estimation était 11 % TROP COURTE, ce qui
 * faisait chevaucher « par tour. » et « (Les artefacts ».
 */
const RULES_WEIGHT_FACTOR = 0.8889;

/**
 * Largeur de l'italique rapportée à celle du romain.
 *
 * MPlantin-Italic est plus étroite que MPlantin. Sans ce facteur, le curseur
 * avançait de la largeur ROMAINE pour un segment rendu en italique, et le
 * segment suivant se posait trop loin.
 *
 * Calibré sur les textes qui sont RÉELLEMENT mis en italique (noms de capacité,
 * textes de rappel, ambiance). Le rapport varie de 0.856 à 0.937 selon la
 * phrase — l'imprécision irréductible d'une table de glyphes moyenne — donc on
 * retient 0.913, la valeur qui reproduit « Prérogative de Time Lord » au corps
 * du rendu (267 px mesurés au navigateur). Trop bas, le mot suivant se colle au
 * texte italique ; trop haut, un blanc s'ouvre.
 */
const RULES_ITALIC_FACTOR = 0.913;

/** Largeur brute, sans marge : sert au positionnement, où l'exactitude prime. */
export function measureText(
	text: string,
	fontSize: number,
	isBold = true,
	isItalic = false
): number {
	let total = 0;
	for (const character of text) total += glyphWidth(character);
	const weight = isBold ? 1 : RULES_WEIGHT_FACTOR;
	return total * fontSize * weight * (isItalic ? RULES_ITALIC_FACTOR : 1);
}

function measureTitle(text: string, fontSize: number): number {
	return measureText(text, fontSize) * TITLE_SAFETY_MARGIN;
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
export function fitTitle(title: string, availableWidth: number, maxFontSize?: number): FittedTitle {
	// Corps plein = celui MESURÉ dans le corpus quand on l'a. `TITLE_MAX_FONT_SIZE`
	// n'est qu'un repli pour les gabarits sans police mesurée : c'était une
	// constante calibrée sur M15, qui ignorait le corps déclaré par le style et
	// annulait au passage le facteur d'échelle des polices.
	const ceiling = maxFontSize ?? TITLE_MAX_FONT_SIZE;
	if (!title) return { text: title, fontSize: ceiling };

	// Largeur à corps 1 : la largeur à n'importe quel corps s'en déduit par
	// produit, ce qui donne le corps idéal sans boucler.
	const unitWidth = measureTitle(title, 1);
	if (unitWidth * ceiling <= availableWidth) {
		return { text: title, fontSize: ceiling };
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

export type RulesSegment =
	| { kind: 'text'; value: string; isItalic?: boolean }
	| { kind: 'symbol'; value: string; code: string };

/**
 * Typographie d'impression : apostrophe droite -> apostrophe courbe.
 *
 * Scryfall ne livre QUE l'apostrophe droite (mesuré : 256 occurrences de U+0027
 * et zéro de U+2019 sur 164 impressions, français et anglais confondus), alors
 * que la carte imprimée porte la courbe. C'est donc une transformation de
 * RENDU : le texte stocké garde la forme de la source, et seule la peinture
 * applique la typographie.
 *
 * Ne touche pas aux guillemets droits (`"`) : le français imprime des
 * chevrons, que Scryfall fournit déjà (« … »), et convertir à l'aveugle
 * produirait des guillemets anglais sur une carte française.
 */
export function printedTypography(text: string): string {
	return text.replace(/'/g, '\u2019');
}

/**
 * Portions d'un texte de règles imprimées en ITALIQUE.
 *
 * Deux conventions, toutes deux visibles sur une carte réelle :
 *
 * - le NOM DE CAPACITÉ, en tête, jusqu'au tiret cadratin qui l'introduit
 *   (« Prérogative de Time Lord — À chaque fois… ») ;
 * - le TEXTE DE RAPPEL, entre parenthèses (« (Les artefacts… un jeton.) »),
 *   qui rappelle une règle sans rien ajouter.
 *
 * Renvoie des intervalles `[début, fin[` sur le texte ENTIER plutôt qu'un
 * découpage : le retour à la ligne coupe ailleurs, et une portion italique
 * traverse volontiers deux lignes.
 *
 * Le nom de capacité n'est reconnu qu'en TÊTE de paragraphe et avant le premier
 * tiret : « copiez-le, excepté que » en contient un aussi, et tout mettre en
 * italique jusqu'au dernier tiret italiserait la moitié de la carte.
 */
export function italicRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];

	// Nom de capacité : uniquement au tout début, et seulement si le tiret arrive
	// assez tôt pour être un séparateur de nom plutôt qu'une incise. Un nom ne
	// porte AUCUNE ponctuation de phrase — sans ce test, « Vol, piétinement.
	// Cette créature — ou une autre — » passait pour un nom de capacité.
	const dash = text.search(/ — /);
	const head = dash > 0 ? text.slice(0, dash) : '';
	if (head && head.length <= ABILITY_NAME_MAX_LENGTH && !/[.,;:!?\n]/.test(head)) {
		ranges.push([0, dash]);
	}

	// Textes de rappel : chaque groupe parenthésé, parenthèses comprises.
	const reminder = /\([^()]*\)/g;
	let match = reminder.exec(text);
	while (match) {
		ranges.push([match.index, match.index + match[0].length]);
		match = reminder.exec(text);
	}

	return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Au-delà, un tiret cadratin est une incise et non un nom de capacité.
 *
 * Les noms de capacité imprimés sont courts (« Prérogative de Time Lord »,
 * « Cohorte », « Ravitaillement »). La borne évite d'italiser une phrase
 * entière qui contiendrait un tiret plus loin.
 */
const ABILITY_NAME_MAX_LENGTH = 40;

/**
 * Découpe une ligne de texte de règles en segments texte / symbole.
 *
 * Le texte de règles contient des symboles entre accolades ({T}, {2}{U}, {W/P}…)
 * qu'une vraie carte dessine, pas qu'elle écrit. Le rendu SVG a besoin de la
 * découpe pour intercaler des <image> entre les <text>.
 *
 * `code` est le contenu sans les accolades, normalisé en majuscules — la forme
 * qu'attend la map Scryfall (via `{CODE}`).
 */
export function splitRulesSegments(line: string): RulesSegment[] {
	const segments: RulesSegment[] = [];
	for (const part of line.split(/(\{[^{}]+\})/g)) {
		if (!part) continue;
		const inner = /^\{([^{}]+)\}$/.exec(part);
		if (inner) segments.push({ kind: 'symbol', value: part, code: inner[1].trim().toUpperCase() });
		else segments.push({ kind: 'text', value: part });
	}
	return segments;
}

/**
 * Découpe une ligne en segments, en appliquant les italiques du texte ENTIER.
 *
 * `offset` est la position de la ligne dans ce texte : c'est lui qui permet de
 * rapporter des plages globales (cf. `italicRanges`) à une ligne qui, elle, a
 * été coupée ailleurs. Un segment chevauchant une frontière d'italique est
 * scindé, pour que « Prérogative de Time Lord — À chaque fois » porte les deux
 * styles sur la même ligne.
 */
export function splitStyledSegments(
	line: string,
	offset: number,
	ranges: Array<[number, number]>
): RulesSegment[] {
	if (ranges.length === 0) return splitRulesSegments(line);

	const isItalicAt = (index: number) =>
		ranges.some(([start, end]) => index >= start && index < end);

	const out: RulesSegment[] = [];
	let cursor = offset;
	for (const segment of splitRulesSegments(line)) {
		if (segment.kind === 'symbol') {
			out.push(segment);
			cursor += segment.value.length;
			continue;
		}
		// Scinde le texte à chaque changement de style, caractère par caractère :
		// les plages sont peu nombreuses et les lignes courtes.
		let run = '';
		let runItalic = isItalicAt(cursor);
		for (const char of segment.value) {
			const italic = isItalicAt(cursor);
			if (italic !== runItalic && run) {
				out.push({ kind: 'text', value: run, isItalic: runItalic });
				run = '';
			}
			runItalic = italic;
			run += char;
			cursor += char.length;
		}
		if (run) out.push({ kind: 'text', value: run, isItalic: runItalic });
	}
	return out;
}

/**
 * Largeur d'une ligne de règles à un corps donné, symboles compris.
 *
 * Les symboles sont dessinés carrés et légèrement plus petits que le corps
 * (SYMBOL_SIZE_RATIO), donc leur largeur ne suit pas celle du texte : sans ce
 * calcul dédié, les segments qui suivent un symbole seraient mal positionnés.
 */
export const RULES_SYMBOL_SIZE_RATIO = 0.82;

export function measureRulesLine(line: string, fontSize: number): number {
	let total = 0;
	for (const segment of splitRulesSegments(line)) {
		total +=
			segment.kind === 'symbol'
				? fontSize * RULES_SYMBOL_SIZE_RATIO
				: measureText(segment.value, fontSize, false);
	}
	return total;
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
