/**
 * Paliers de qualité des images de cadre.
 *
 * Le studio sert le MÊME cadre à trois tailles, parce qu'aperçu et export n'ont
 * pas les mêmes contraintes : l'aperçu se redessine à chaque frappe et doit
 * rester fluide, l'export est ponctuel et doit être imprimable.
 *
 * Les poids sont MESURÉS sur `m15FrameW` (2010x2814 à l'origine), en WebP
 * qualité 92 :
 *
 *   preview   750 px    32 Ko    taille de rendu actuelle du canvas
 *   hq       1500 px    92 Ko    aperçu agrandi, écart à l'original 1.05/255
 *   source   2010 px  2100 Ko    PNG natif, jamais réencodé
 *
 * `source` reste le PNG d'origine et non un WebP de même taille : l'export part
 * ainsi d'une image qui n'a subi aucune compression avec perte, ce qui compte
 * dès qu'on tire au-delà de la taille écran.
 */
export const CARD_QUALITIES = ['preview', 'hq', 'source'] as const;

export type CardQuality = (typeof CARD_QUALITIES)[number];

/**
 * Palier par défaut de l'APERÇU.
 *
 * `preview` et non `hq` : le canvas rend aujourd'hui à 744x1039, donc 750 px
 * suffit au pixel près. Monter d'office en `hq` triplerait le poids chargé pour
 * un gain invisible tant que l'aperçu n'est pas agrandi.
 */
export const DEFAULT_PREVIEW_QUALITY: CardQuality = 'preview';

/** Palier par défaut de l'EXPORT : le maximum disponible, c'est son intérêt. */
export const DEFAULT_EXPORT_QUALITY: CardQuality = 'source';

/** Largeur servie par chaque palier, en pixels. */
export const QUALITY_WIDTH: Record<CardQuality, number> = {
	preview: 750,
	hq: 1500,
	source: 2010,
};

/**
 * Emprise de la couronne légendaire CardConjurer, en fraction de la carte.
 *
 * Les couronnes MSE sont des images PLEINE CARTE : le contenu est déjà à sa
 * place dans un cadre transparent, donc le canvas les peint en 0,0 → largeur,
 * hauteur. Celles de CardConjurer sont des BANDEAUX (750x185 au palier
 * d'aperçu, contre 750x1050 pour un cadre), accompagnés de leur position — les
 * peindre en pleine carte les étirait sur toute la hauteur et recouvrait la
 * carte entière de blanc.
 *
 * Les valeurs sont celles que CardConjurer déclare dans
 * `data/scripts/versions/m15/legendCrowns.js`, reprises telles quelles :
 *
 *     x 41/1500   y 40/2100   w 1418/1500   h 350/2100
 *
 * Elles tombent sur y 10.0 → 97.1 en unités de style, ce que confirme la
 * couronne MSE correspondante (contenu opaque y 10 → 102).
 */
export const CC_CROWN_BOUNDS = {
	x: 41 / 1500,
	y: 40 / 2100,
	width: 1418 / 1500,
	height: 350 / 2100,
};

/**
 * Emprise du panneau force/endurance CardConjurer, en fraction de la carte.
 *
 * Même partage que la couronne : les cadres MSE peignent ce panneau dans leur
 * image, ceux de CardConjurer le livrent à part avec sa position.
 *
 * Valeurs déclarées dans `data/scripts/versions/m15/regular.js`, reprises TELLES
 * QUELLES :
 *
 *     x 1136/1500   y 1858/2100   w 282/1500   h 154/2100
 *
 * Elles préservent le rapport du PNG (`m15PTW.png` fait 377x206, soit 1.83 ;
 * la boîte donne 70.5 x 38.4 unités de style, soit 1.84). Les recalculer depuis
 * le panneau MESURÉ sur une carte imprimée (280..355 x, 469..492 y) donnerait un
 * rapport de 2.98 : le panneau y serait écrasé d'un tiers en hauteur.
 *
 * L'écart apparent en HAUTEUR avec l'impression vient de la marge TRANSPARENTE
 * de l'asset — il n'est opaque que de 3.9 % à 95.6 % de sa hauteur — et non
 * d'une erreur de position : le contenu visible tombe bien dans le bandeau,
 * c'est la boîte qui le déborde. Il ne faut donc pas la corriger d'après ce
 * qu'on voit imprimé, sous peine d'écraser le panneau (une boîte recalculée sur
 * le panneau visible donnait un rapport de 2.98 pour une image de 1.83).
 */
export const CC_PT_BOUNDS = {
	x: 1136 / 1500,
	y: 1858 / 2100,
	width: 282 / 1500,
	height: 154 / 2100,
};

/**
 * Zone de TEXTE force/endurance, distincte du panneau qui la porte.
 *
 * Déclarée dans `data/scripts/versions/m15/version.js` :
 *
 *     new cardText('Power/Toughness', '', 1191/1500, 1954/2100, 205/1500,
 *                  78/2100, 'belerenbsc', 78/2100, 'black',
 *                  ['oneLine=true,textAlign="center"'])
 *
 * Soit une boîte à x 297.8..349.0, y 486.6..506.1 en unités de style, un corps
 * de 19.4 u, et un texte CENTRÉ dans cette boîte (`textAlign="center"`).
 *
 * C'est la source à suivre plutôt que la boîte `pt` du corpus MSE ou le centre
 * du panneau : les trois ne coïncident pas, et seule celle-ci décrit ce que
 * CardConjurer peint réellement. La taille y est déjà en unités de carte, donc
 * elle ne passe PAS par le facteur dpi des polices MSE.
 */
export const CC_PT_TEXT = {
	x: 1191 / 1500,
	y: 1954 / 2100,
	width: 205 / 1500,
	height: 78 / 2100,
};

/**
 * Part de `CC_PT_BOUNDS` réellement OPAQUE dans l'asset, verticalement.
 *
 * `m15PTW.png` n'est pas plein cadre : son panneau clair occupe 4.85 % à 80.1 %
 * de la hauteur du fichier, le reste étant la marge et l'ombre portée. La boîte
 * déclarée décrit donc le fichier, pas le bandeau visible.
 *
 * C'est cette part qu'il faut viser pour centrer le texte : la zone déclarée
 * (`CC_PT_TEXT`) est calée sur le repère de CardConjurer, où le panneau ne tombe
 * pas au même endroit que chez nous. S'y fier posait la ligne de base à 500.2
 * pour un panneau peint de 464.6 à 493.5 — le texte sortait par le bas.
 */
export const CC_PT_PANEL_INSET = { top: 0.0485, bottom: 0.801 };

/**
 * Facteur d'échelle du rendu PNG à l'export.
 *
 * Le canvas a un viewBox de ~745 px de large ; multiplier par ce facteur donne
 * la largeur finale du PNG. Les valeurs sont choisies pour retomber sur la
 * largeur native de chaque palier, afin que le cadre ne soit ni agrandi ni
 * réduit — c'est là qu'on gagne ou qu'on perd la netteté.
 */
export const QUALITY_EXPORT_SCALE: Record<CardQuality, number> = {
	preview: 1,
	hq: 2,
	source: 2.7,
};
