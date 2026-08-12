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
 * Sprites CardConjurer d'une FAMILLE de cadres, en fraction de la carte.
 *
 * Les cadres MSE livrent chaque élément en image PLEINE CARTE (contenu déjà en
 * place dans un fond transparent) ; CardConjurer livre des SPRITES accompagnés
 * de leur position. Les peindre en pleine carte les étire — la couronne, bandeau
 * de 750x185, recouvrait toute la carte de blanc.
 *
 * Les valeurs sont INDEXÉES PAR FAMILLE et non globales : chaque famille déclare
 * les siennes dans son propre référentiel. M15 écrit en 1500x2100
 * (`data/scripts/versions/m15/*.js`), la 8e édition en 2010x2814
 * (`js/frames/pack8th.js`), et leurs bornes ne se recouvrent pas — le cache de
 * couronne du M15 est encadré (59/1500 … 1382/1500) là où celui de la 8e couvre
 * toute la largeur. Appliquer les constantes M15 à la 8e donnerait un rendu faux.
 *
 * Les fractions étant sans dimension, le référentiel d'origine n'a pas besoin
 * d'être conservé : seul compte le rapport, identique dans les deux repères.
 */
export interface CcSpriteBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CcFrameGeometry {
	/** Couronne légendaire, ou `null` si la famille n'en a pas (ABU). */
	crown: CcSpriteBounds | null;
	/**
	 * Cache noir posé SOUS la couronne.
	 *
	 * Le cadre a sa propre barre de titre claire (dès y 15.0 sur M15) qui
	 * remplirait les creux entre les pointes. Une carte légendaire imprimée y
	 * montre du noir : sans ce cache la silhouette plafonne au bord du cadre au
	 * lieu d'onduler (amplitude 6.0 au lieu de 12.6, pour 12.3 mesurés sur une
	 * carte réelle).
	 */
	crownCover: CcSpriteBounds | null;
	/** Panneau force/endurance, ou `null` si le cadre l'intègre (ABU). */
	pt: CcSpriteBounds | null;
	/**
	 * Part VERTICALE de `pt` réellement opaque dans l'asset.
	 *
	 * Le PNG n'est pas plein cadre : sa marge et son ombre portée débordent du
	 * panneau clair. C'est cette part qu'il faut viser pour centrer le texte —
	 * s'appuyer sur la boîte entière posait la ligne de base sous le panneau.
	 */
	ptPanelInset: { top: number; bottom: number };
}

/**
 * Géométrie par famille. La clé est le préfixe de chemin sous `cc/<palier>/`,
 * donc elle se lit directement dans l'URL de l'asset servi.
 */
export const CC_FRAME_GEOMETRY: Record<string, CcFrameGeometry> = {
	// M15 — `data/scripts/versions/m15/{legendCrowns,regular}.js`, repère 1500x2100.
	m15: {
		crown: { x: 41 / 1500, y: 40 / 2100, width: 1418 / 1500, height: 350 / 2100 },
		crownCover: { x: 59 / 1500, y: 58 / 2100, width: 1382 / 1500, height: 37 / 2100 },
		pt: { x: 1136 / 1500, y: 1858 / 2100, width: 282 / 1500, height: 154 / 2100 },
		ptPanelInset: { top: 0.0485, bottom: 0.801 },
	},
	// 8e édition — `js/frames/pack8th{,LegendCrowns}.js`, repère 2010x2814.
	// Le cache y couvre toute la largeur de la carte, contrairement au M15.
	'8th': {
		crown: { x: 64 / 2010, y: 81 / 2814, width: 1886 / 2010, height: 482 / 2814 },
		crownCover: { x: 0, y: 0, width: 1, height: 160 / 2814 },
		pt: { x: 1461 / 2010, y: 2481 / 2814, width: 414 / 2010, height: 218 / 2814 },
		ptPanelInset: { top: 0.0485, bottom: 0.801 },
	},
	// ABU — `js/frames/packABU.js`. Cadres COMPLETS : ni couronne ni panneau P/T
	// séparés, tout est peint dans l'image du cadre.
	old: {
		crown: null,
		crownCover: null,
		pt: null,
		ptPanelInset: { top: 0, bottom: 1 },
	},
	// 7e édition — `js/frames/packSeventh.js`. Cadres COMPLETS comme ABU : le
	// panneau force/endurance est peint dans l'image, et les cartes légendaires
	// d'avant la 8e n'avaient pas de couronne. Le fichier ne déclare qu'une zone
	// de TEXTE pour la P/T (`x:0.8074, y:0.9043`), pas un sprite à poser.
	seventh: {
		crown: null,
		crownCover: null,
		pt: null,
		ptPanelInset: { top: 0, bottom: 1 },
	},
};

/**
 * Géométrie de la famille dont relève un chemin d'asset, ou `null`.
 *
 * Le chemin porte la famille juste après le palier (`cc/preview/m15/…`), donc on
 * la lit là plutôt que de la passer de main en main depuis le catalogue.
 * `null` pour un asset MSE : il n'a pas de sprite à placer.
 */
export function ccFrameGeometry(path: string | null | undefined): CcFrameGeometry | null {
	if (!path) return null;
	const match = /\/cc\/[^/]+\/([^/]+)\//.exec(path);
	return match ? (CC_FRAME_GEOMETRY[match[1]] ?? null) : null;
}

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
