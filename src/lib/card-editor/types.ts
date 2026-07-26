export const DEFAULT_FRAME_TEMPLATE_ID = 'cardconjurer-m15-regular';

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
export const CARD_FIELD_MAX_LENGTH: Record<EditableCardField, number> = {
	name: 80,
	manaCost: 80,
	typeLine: 120,
	oracleText: 1600,
	flavorText: 320,
	power: 8,
	toughness: 8,
	loyalty: 8,
	artist: 100,
};

/**
 * Mêmes bornes pour les champs texte du brouillon (panneau Détails), qui
 * passent par updateDraft et non par updateFace. Les clés absentes ici ne sont
 * pas des chaînes libres (booléens, énumérations bornées par un <select>).
 */
export const DRAFT_FIELD_MAX_LENGTH: Partial<Record<keyof CustomCardDraft, number>> = {
	setName: 80,
	setCode: 6,
	collectorNumber: 12,
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
