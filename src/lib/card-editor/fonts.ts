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
 * Convertit une police du corpus vers une police prête à peindre.
 *
 * `scale` est le même facteur que celui appliqué aux boîtes : les tailles du
 * corpus sont en unités de style (6.93 à 32 selon le gabarit), pas en pixels du
 * canvas. C'est précisément ce qui manquait quand le canvas écrivait
 * `fontSize="25"` en dur — une valeur juste pour M15 seul, fausse partout
 * ailleurs.
 */
export function toCardTextFont(
	font: MseFont | undefined,
	scale: number,
	box?: { top: number; height: number; left: number },
	layout?: MseLayout
): CardTextFont | undefined {
	if (!font) return undefined;
	const family = cssFamilyFor(font.name);
	if (!family) return undefined;
	const size = font.size * scale;
	if (!Number.isFinite(size) || size <= 0) return undefined;
	return {
		family,
		size,
		baseline: baselineFor(size, box, layout, font, scale),
		left: box ? (box.left + (layout?.padding?.left ?? 0)) * scale : undefined,
	};
}

/** Police telle qu'elle arrive du corpus, avant mise à l'échelle. */
interface MseFont {
	name: string;
	size: number;
	ascent?: number;
	descent?: number;
}

/** Ancrage et marges tels qu'ils arrivent du corpus. */
interface MseLayout {
	anchor?: 'top' | 'middle' | 'bottom';
	padding?: { top?: number; left?: number; right?: number; bottom?: number };
}

/**
 * Ligne de base du texte dans sa boîte.
 *
 * MSE ancre le texte, il ne le décale pas d'une constante. Les trois ancrages
 * du corpus se traduisent directement, `asc`/`desc` étant les métriques réelles
 * de la police (elles varient beaucoup : Beleren 0.936, MPlantin 0.774,
 * MagicMedieval 0.746, d'où l'impossibilité d'une constante) :
 *
 *   top    → haut de boîte + marge, puis descendre de l'ascendante
 *   bottom → bas de boîte − marge, puis remonter de la descendante
 *   middle → hauteur de glyphe centrée dans la boîte
 *
 * Rend `undefined` s'il manque la boîte, l'ancrage ou les métriques : le canvas
 * garde alors son décalage générique plutôt qu'une position devinée.
 */
function baselineFor(
	size: number,
	box: { top: number; height: number } | undefined,
	layout: MseLayout | undefined,
	font: MseFont,
	scale: number
): number | undefined {
	const anchor = layout?.anchor;
	if (!box || !anchor || font.ascent === undefined || font.descent === undefined) {
		return undefined;
	}
	const top = box.top * scale;
	const height = box.height * scale;
	const ascent = size * font.ascent;
	const descent = size * font.descent;
	if (anchor === 'top') return top + (layout.padding?.top ?? 0) * scale + ascent;
	if (anchor === 'bottom') return top + height - (layout.padding?.bottom ?? 0) * scale - descent;
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
