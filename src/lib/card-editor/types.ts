export const DEFAULT_FRAME_TEMPLATE_ID = 'cardconjurer-m15-regular';

/**
 * Gabarit « maison » : la carte est rendue avec les cadres intégrés de Wizcard,
 * sans cadre vendor. Ce n'est PAS un id du catalogue — le préfixe `wizcard:` est
 * réservé (aucun id du catalogue ne contient « : »), ce qui garantit que
 * `useSelectedMseTemplate` ne le résoudra jamais et que `resolveMseFramePath`
 * retombera sur le rendu intégré.
 */
export const HOUSE_FRAME_TEMPLATE_ID = 'wizcard:house';

export const CARD_LAYOUT_IDS = [
	'arcana',
	'modern',
	'full-art',
	'showcase',
	'token',
	'planeswalker',
	'saga',
	'adventure',
	'landscape',
] as const;

export type CardLayoutId = (typeof CARD_LAYOUT_IDS)[number];

export const FRAME_STYLE_IDS = [
	'auto',
	'light',
	'tide',
	'void',
	'ember',
	'grove',
	'prismatic',
	'artifact',
] as const;

export type FrameStyleId = (typeof FRAME_STYLE_IDS)[number];
export type CardRarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export type CardFinish = 'matte' | 'foil' | 'etched';

export interface CardArtworkDraft {
	dataUrl: string;
	fileName: string;
	mimeType: string;
	zoom: number;
	offsetX: number;
	offsetY: number;
}

export interface CardFaceDraft {
	name: string;
	manaCost: string;
	typeLine: string;
	oracleText: string;
	flavorText: string;
	power: string;
	toughness: string;
	loyalty: string;
	artist: string;
	frameStyle: FrameStyleId;
	accentColor: string;
	artwork: CardArtworkDraft;
}

export interface CustomCardDraft {
	version: 1;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	faces: [CardFaceDraft, CardFaceDraft?];
	activeFace: 0 | 1;
	rarity: CardRarity;
	finish: CardFinish;
	setName: string;
	setCode: string;
	collectorNumber: string;
	language: string;
	tags: string;
	isPublic: boolean;
	updatedAt: string;
}

export type EditableCardField =
	| 'name'
	| 'manaCost'
	| 'typeLine'
	| 'oracleText'
	| 'flavorText'
	| 'power'
	| 'toughness'
	| 'loyalty'
	| 'artist';

/**
 * Longueur maximale de chaque champ éditable, appliquée dans le STATE.
 *
 * Les attributs `maxLength` des <input> ne bornent que la saisie clavier : une
 * valeur posée par programme — collage traité par React, brouillon restauré du
 * localStorage, champ pré-rempli — les traverse sans obstacle. Mesuré : un
 * `maxLength={80}` laissait passer 300 caractères jusqu'au state, et donc
 * jusqu'en base.
 *
 * Ces valeurs restent alignées sur les `maxLength` de EditorSidebar et de
 * CardCanvas, qui gardent leur utilité pour le retour immédiat à la frappe.
 */
/**
 * Bornes calées sur les valeurs RÉELLES du jeu, relevées via l'API Scryfall :
 *   name        141  « Our Market Research Shows That Players Like… » (Unhinged)
 *   type_line    37  « Legendary Creature — Elemental Shaman »
 *   oracle_text 397  Nicol Bolas, God-Pharaoh
 *   flavor_text  ~300
 *   artist       16
 * On garde une marge au-dessus de ces maxima : le studio sert à créer des cartes
 * originales, pas seulement à recopier l'existant. Mais plus de bornes molles à
 * 1600 caractères — la DB stocke du `text` sans limite, donc c'est ici que ça se
 * joue.
 *
 * manaCost est borné en caractères ici, mais sa vraie contrainte est le nombre
 * de pips (MAX_MANA_PIPS, cf. clampManaCost).
 */
export const CARD_FIELD_MAX_LENGTH: Record<EditableCardField, number> = {
	name: 160,
	manaCost: 120,
	typeLine: 80,
	oracleText: 800,
	flavorText: 400,
	power: 6,
	toughness: 6,
	loyalty: 6,
	artist: 60,
};

/**
 * Mêmes bornes pour les champs texte du brouillon (panneau Détails), qui
 * passent par updateDraft et non par updateFace. Les clés absentes ici ne sont
 * pas des chaînes libres (booléens, énumérations bornées par un <select>).
 */
export const DRAFT_FIELD_MAX_LENGTH: Partial<Record<keyof CustomCardDraft, number>> = {
	// Relevés sur /sets : le code le plus long fait 6, le nom d'extension 54
	// (« The Lord of the Rings: Tales of Middle-earth Minigames »).
	setName: 80,
	setCode: 6,
	collectorNumber: 8,
	tags: 240,
};

export interface CardEditorPayload {
	version: 1;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	faces: Array<{
		name: string;
		manaCost: string;
		typeLine: string;
		oracleText: string;
		flavorText: string;
		power: string;
		toughness: string;
		loyalty: string;
		artist: string;
		frameStyle: FrameStyleId;
		accentColor: string;
		artwork: Omit<CardArtworkDraft, 'dataUrl'> & { storagePath: string | null };
	}>;
	rarity: CardRarity;
	finish: CardFinish;
	setName: string;
	setCode: string;
	collectorNumber: string;
	language: string;
	tags: string[];
}

export interface CardRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface CardLayoutGeometry {
	width: number;
	height: number;
	art: CardRect;
	title: CardRect;
	mana: CardRect;
	typeLine: CardRect;
	rules: CardRect;
	stats: CardRect;
	footer: CardRect;
}

export interface CardLayoutDefinition {
	id: CardLayoutId;
	labelKey: CardLayoutId;
	descriptionKey: CardLayoutId;
	orientation: 'portrait' | 'landscape';
	geometry: CardLayoutGeometry;
}

export interface CardCanvasLabels {
	namePlaceholder: string;
	typePlaceholder: string;
	rulesPlaceholder: string;
	artistPrefix: string;
	customMark: string;
	panArtwork: string;
	editName: string;
	editManaCost: string;
	editType: string;
	editRules: string;
	editStats: string;
}
