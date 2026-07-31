import localFont from 'next/font/local';

/**
 * Polices du corpus MSE, servies pour le rendu des cartes du studio.
 *
 * Le canvas écrivait Georgia et Arial en dur, qui n'apparaissent NULLE PART dans
 * le corpus pour les champs d'une carte. Chaque style déclare ses propres
 * polices, et le pipeline les extrait désormais jusqu'ici (cf.
 * scripts/mse-geometry § polices, et src/lib/card-editor/fonts.ts pour la
 * correspondance nom MSE → famille CSS).
 *
 * Les huit fichiers couvrent l'essentiel du corpus mesuré :
 *   Matrix 147 · MPlantin 145 · Beleren Bold 67 · ModMatrix 50 · MagicMedieval 19
 *
 * `display: 'block'` — et non `'swap'` comme les polices d'interface : une carte
 * rendue d'abord en Georgia puis re-rendue en Beleren produit un saut très
 * visible, et surtout l'export PNG pourrait capturer la police de repli. Un
 * court invisible vaut mieux qu'une carte exportée avec la mauvaise police.
 *
 * ⚠ LICENCES — Beleren, Matrix, ModMatrix et MPlantin sont des polices
 * propriétaires (Wizards of the Coast). Les servir en webfont les expose au
 * téléchargement direct : c'est une extension du point « Frame licences » déjà
 * ouvert dans docs/card-studio.md, et il reste à trancher avant toute
 * distribution publique. Pour basculer vers des substituts libres, il suffit de
 * changer la table de `src/lib/card-editor/fonts.ts` — le pipeline, la base et
 * le canvas n'en savent rien.
 */

const belerenBold = localFont({
	src: './mse/beleren-bold.ttf',
	variable: '--font-mse-beleren-bold',
	display: 'block',
});
const belerenSmallCapsBold = localFont({
	src: './mse/beleren-smallcaps-bold.ttf',
	variable: '--font-mse-beleren-smallcaps-bold',
	display: 'block',
});
const matrix = localFont({
	src: './mse/matrix.ttf',
	variable: '--font-mse-matrix',
	display: 'block',
});
const matrixBold = localFont({
	src: './mse/matrix-bold.ttf',
	variable: '--font-mse-matrix-bold',
	display: 'block',
});
const modMatrix = localFont({
	src: './mse/modmatrix.ttf',
	variable: '--font-mse-modmatrix',
	display: 'block',
});
const mplantin = localFont({
	src: './mse/mplantin.ttf',
	variable: '--font-mse-mplantin',
	display: 'block',
});
const mplantinItalic = localFont({
	src: './mse/mplantin-italic.ttf',
	variable: '--font-mse-mplantin-italic',
	display: 'block',
});
const magicMedieval = localFont({
	src: './mse/magicmedieval.ttf',
	variable: '--font-mse-magicmedieval',
	display: 'block',
});

/**
 * Classes à poser sur `<body>` pour publier les variables CSS.
 *
 * Même mécanique que `BRAND_FONT_VARIABLES` : sans ces classes, les
 * `var(--font-mse-*)` ne résolvent nulle part et chaque carte retombe
 * silencieusement sur sa pile générique.
 */
export const MSE_FONT_VARIABLES = [
	belerenBold.variable,
	belerenSmallCapsBold.variable,
	matrix.variable,
	matrixBold.variable,
	modMatrix.variable,
	mplantin.variable,
	mplantinItalic.variable,
	magicMedieval.variable,
].join(' ');
