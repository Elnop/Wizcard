import type { CardTextFont } from './types';

/**
 * Correspondance nom de police MSE → famille CSS.
 *
 * Le corpus écrit un nom LOGIQUE (« Beleren Bold », « ModMatrix ») qui n'est ni
 * un nom de fichier ni une famille CSS. Cette table est le SEUL point de
 * jonction entre les deux : elle est délibérément isolée ici parce que c'est
 * aussi le point où bascule la question des licences — passer des vraies
 * polices MSE à des substituts libres se fait en changeant ces valeurs, sans
 * toucher ni au pipeline d'extraction, ni à la base, ni au canvas.
 *
 * Les cinq premières couvrent l'essentiel du corpus mesuré (~430 des ~480
 * résolutions sur les 140 gabarits) :
 *   Matrix 147 · MPlantin 145 · Beleren Bold 67 · ModMatrix 50 · MagicMedieval 19
 *
 * La clé est comparée en MINUSCULES : le corpus écrit « MPlantin » et
 * « Mplantin » pour la même police (3 gabarits sur la seconde forme).
 *
 * Un nom absent de la table rend `null` — le champ garde alors la pile
 * générique du canvas plutôt qu'une police approchante choisie au jugé. C'est la
 * règle « aucun fallback » : une police voisine mais fausse est plus trompeuse
 * qu'une police visiblement générique.
 */
const CSS_FAMILY_BY_MSE_NAME: Record<string, string> = {
	// Titre / ligne de type / P/T des cadres modernes (M15).
	'beleren bold': 'var(--font-mse-beleren-bold), Georgia, serif',
	'beleren small caps bold': 'var(--font-mse-beleren-smallcaps-bold), Georgia, serif',
	// Titre / ligne de type des cadres pré-M15.
	matrix: 'var(--font-mse-matrix), Georgia, serif',
	matrixbold: 'var(--font-mse-matrix-bold), Georgia, serif',
	'matrix-bold': 'var(--font-mse-matrix-bold), Georgia, serif',
	// P/T des cadres pré-M15.
	modmatrix: 'var(--font-mse-modmatrix), Georgia, serif',
	// Texte de règles, toutes époques.
	mplantin: 'var(--font-mse-mplantin), Georgia, serif',
	'mplantin-italic': 'var(--font-mse-mplantin-italic), Georgia, serif',
	// Titre des cadres les plus anciens.
	magicmedieval: 'var(--font-mse-magicmedieval), Georgia, serif',
};

/** Police d'ambiance : l'italique du corpus, pas un `font-style` synthétique. */
export const FLAVOR_ITALIC_FAMILY = CSS_FAMILY_BY_MSE_NAME['mplantin-italic'];

/**
 * Famille CSS d'un nom de police MSE, ou `null` si la police n'est pas servie.
 */
export function cssFamilyFor(mseName: string): string | null {
	return CSS_FAMILY_BY_MSE_NAME[mseName.trim().toLowerCase()] ?? null;
}

/**
 * Résolution d'écran à laquelle MSE exprime ses tailles de police, rapportée à
 * celle de la carte.
 *
 * Les BOÎTES du corpus sont en pixels à `card dpi` (150 : 375 u pour 2.48" de
 * large, soit 151 u/pouce — la mesure colle au déclaratif). Les TAILLES DE
 * POLICE, elles, sont exprimées à 120 dpi, la résolution d'écran « grandes
 * polices » de Windows sous laquelle MSE a été écrit. D'où un rapport 150/120
 * entre les deux, qu'il faut appliquer aux polices et à elles seules.
 *
 * Sans ce facteur, tout le texte sortait 20 % trop petit alors que les panneaux
 * étaient justes. Vérifié en comparant une carte IMPRIMÉE (Ekthi, MBC) au rendu
 * du studio, même texte et même cadre M15, normalisé sur la largeur de carte :
 *
 *   bandeau de la ligne de type : rapport 1.019  → géométrie déjà juste
 *   nom / type / règles         : rapport 1.274  → polices trop petites
 *   1.274 / 1.019               = 1.2502         → exactement 150/120
 *
 * Et une fois le facteur appliqué, la prédiction tombe sur la mesure pour les
 * deux champs à taille FIXE : nom 14.00 u prédit contre 14.25 mesuré, ligne de
 * type 11.38 contre 11.50 (hauteurs de capitale, en unités de style).
 *
 * Le texte de RÈGLES ne sert pas de contrôle : il déclare `scale down to: 6`,
 * donc MSE le rétrécit pour le faire tenir. Sur Ekthi, dont la boîte est pleine,
 * il rend une taille effective de ~11.8 au lieu de 14 — l'écart mesuré y est le
 * rétrécissement, pas une erreur de facteur.
 */
const MSE_FONT_DPI_RATIO = 150 / 120;

/**
 * Convertit une police du corpus vers une police prête à peindre.
 *
 * `scale` est le même facteur que celui appliqué aux boîtes : les tailles du
 * corpus sont en unités de style (6.93 à 32 selon le gabarit), pas en pixels du
 * canvas. C'est précisément ce qui manquait quand le canvas écrivait
 * `fontSize="25"` en dur — une valeur juste pour M15 seul, fausse partout
 * ailleurs.
 *
 * S'y ajoute `MSE_FONT_DPI_RATIO`, qui ne s'applique QU'AUX POLICES : boîtes et
 * tailles ne sont pas exprimées dans le même repère côté MSE.
 */
export function toCardTextFont(
	font: MseFont | undefined,
	scale: number,
	box?: { top: number; height: number; left: number },
	layout?: MseLayout,
	bar?: MseBar
): CardTextFont | undefined {
	if (!font) return undefined;
	const family = cssFamilyFor(font.name);
	if (!family) return undefined;
	const size = font.size * scale * MSE_FONT_DPI_RATIO;
	if (!Number.isFinite(size) || size <= 0) return undefined;
	return {
		family,
		size,
		...(font.capHeight !== undefined ? { capHeight: font.capHeight } : {}),
		baseline: baselineFor(size, box, layout, font, scale, bar),
		left: box ? (box.left + (layout?.padding?.left ?? 0)) * scale : undefined,
		...(font.color ? { color: font.color } : {}),
		// Le déplacement de l'ombre est déclaré en unités de style, comme les
		// tailles et les boîtes : il passe donc par le MÊME facteur d'échelle.
		// L'oublier collerait l'ombre au texte sur les grands gabarits.
		...(font.shadow
			? {
					shadow: {
						color: font.shadow.color,
						dx: font.shadow.dx * scale,
						dy: font.shadow.dy * scale,
					},
				}
			: {}),
	};
}

/** Police telle qu'elle arrive du corpus, avant mise à l'échelle. */
interface MseFont {
	name: string;
	size: number;
	ascent?: number;
	descent?: number;
	inkAscent?: number;
	inkDescent?: number;
	capHeight?: number;
	color?: string;
	shadow?: { color: string; dx: number; dy: number };
}

/** Ancrage et marges tels qu'ils arrivent du corpus. */
interface MseLayout {
	anchor?: 'top' | 'middle' | 'bottom';
	padding?: { top?: number; left?: number; right?: number; bottom?: number };
}

/** Bandeau peint mesuré dans l'image du cadre, en unités de style. */
interface MseBar {
	top: number;
	bottom: number;
}

/**
 * Ligne de base du texte dans sa boîte.
 *
 * MSE ancre le texte, il ne le décale pas d'une constante. Les trois ancrages
 * du corpus se traduisent directement :
 *
 *   top    → haut de boîte + marge, puis descendre de l'ascendante
 *   bottom → bas de boîte − marge, puis remonter de la descendante
 *   middle → hauteur de glyphe centrée dans la boîte
 *
 * DEUX jeux de métriques, et le choix entre eux est ce qui rend l'ancrage juste.
 * `ascent`/`descent` décrivent la LIGNE (`hhea` du TTF, interligne interne
 * compris) ; `inkAscent`/`inkDescent` décrivent l'ENCRE (hauteur d'ascendante et
 * descendantes réelles). MSE cale un bord de boîte sur l'ENCRE : c'est le haut
 * des glyphes qui vient toucher la marge, pas le haut de la ligne.
 *
 * Les confondre décalait chaque champ de l'interligne interne de sa police, qui
 * varie trop pour être compensé globalement : 0.196 em sur Beleren Bold (M15),
 * 0.075 sur MPlantin, 0 sur Matrix. D'où une ligne de type visiblement mal
 * calée sur les cadres M15 et intacte sur `magic-new`, pour un même code.
 *
 * `middle` reste sur les métriques de LIGNE : il centre un bloc dont la hauteur
 * est symétrique, et le corpus s'en sert précisément pour que le texte tombe au
 * milieu du bandeau (cadres pré-8e) — l'encre y donnerait un centrage optique
 * décalé vers le bas.
 *
 * Rend `undefined` s'il manque la boîte, l'ancrage ou les métriques : le canvas
 * garde alors son décalage générique plutôt qu'une position devinée.
 */
function baselineFor(
	size: number,
	box: { top: number; height: number } | undefined,
	layout: MseLayout | undefined,
	font: MseFont,
	scale: number,
	bar?: MseBar
): number | undefined {
	const anchor = layout?.anchor;
	if (!box || !anchor || font.ascent === undefined || font.descent === undefined) {
		return undefined;
	}
	const top = box.top * scale;
	const height = box.height * scale;
	const ascent = size * font.ascent;
	const descent = size * font.descent;
	// Repli sur les métriques de ligne quand l'encre n'est pas publiée (gabarits
	// mesurés avant l'ajout de ces colonnes) : c'est le rendu d'avant, donc pas
	// de régression sur un catalogue partiellement réextrait.
	const inkAscent = size * (font.inkAscent ?? font.ascent);
	const inkDescent = size * (font.inkDescent ?? font.descent);

	// Bandeau mesuré : la bande des CAPITALES s'y centre. Prioritaire sur
	// l'ancrage déclaré, qui décrit le flux dans la BOÎTE (une zone calée sur un
	// bord, plus petite que le panneau) et non la position dans le panneau.
	//
	// La capitale, et non le bloc ascendante+descendante : ce bloc réserve la
	// place d'un jambage sous CHAQUE ligne, y compris celles qui n'en ont pas.
	// « Ekthi, Contaminator Priest » n'a aucune descendante, et le centrer ainsi
	// laissait 6 px de vide au-dessus contre 15 en dessous — le texte visiblement
	// haut dans son bandeau. Centrer les capitales laisse au contraire la
	// descendante pendre librement, ce que fait une carte imprimée (mesurée sur
	// Ekthi : 10 px au-dessus, 14 en dessous, sur un panneau de 51).
	if (bar) {
		const barTop = bar.top * scale;
		const barHeight = (bar.bottom - bar.top) * scale;
		const cap = size * (font.capHeight ?? font.inkAscent ?? font.ascent);
		return barTop + (barHeight - cap) / 2 + cap;
	}

	if (anchor === 'top') return top + (layout.padding?.top ?? 0) * scale + inkAscent;
	if (anchor === 'bottom') {
		return top + height - (layout.padding?.bottom ?? 0) * scale - inkDescent;
	}
	return top + (height - (ascent + descent)) / 2 + ascent;
}

/**
 * Piles génériques, utilisées quand le corpus ne déclare rien d'exploitable.
 *
 * Ce ne sont PAS des polices de carte : elles ne ressemblent à aucun cadre
 * imprimé. Elles n'existent que pour qu'un champ reste lisible plutôt que de
 * disparaître — même statut que `DEFAULT_INK` dans le canvas, et pour la même
 * raison. Le rendu correct passe toujours par la police mesurée.
 */
export const GENERIC_SERIF = "Georgia, 'Times New Roman', serif";
export const GENERIC_SANS = 'Arial, sans-serif';
