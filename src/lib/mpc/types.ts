import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export type CardSourceType = 'mpc_ingested' | 'user_created';
export type CardType = 'card' | 'token' | 'cardback';

export interface MpcSource {
	id: string;
	name: string;
	description?: string;
	isBuiltIn: boolean;
	tags: string[];
}

export interface MpcCard {
	id: string;
	name: string;
	rawName: string;
	displayName: string | null;
	sourceId: string | null;
	imageUrl: string;
	isCustom: true;
	oracleId?: string;
	sourceType: CardSourceType;
	isPublic: boolean;
	createdBy?: string;
	cardType: CardType;
	language: string | null;
	tags: string[];
	variants: string[];
	setCode: string | null;
	collectorNumber: string | null;
	// Scryfall enrichment — populated only for cards matched by oracle_id
	colors?: string[];
	colorIdentity?: string[];
	cmc?: number;
	typeLine?: string;
	manaCost?: string;
	oracleText?: string;
	rarity?: string;
	setName?: string;
	artist?: string;
}

export interface MpcIndexEntry {
	identifier: string;
	name: string;
	rawName: string;
	sourceName: string;
	sourceKey: string;
	smallThumbnailUrl: string;
	mediumThumbnailUrl: string;
	tags: string[];
	dpi: number;
}

export interface CustomCardMeta {
	source_id: string | null;
	source_name: string;
	source_type: CardSourceType;
	card_type: CardType;
	image_url: string;
	lang: string | null;
	tags: string[];
	variants: string[];
	set_code: string | null;
	collector_number: string | null;
	is_public: boolean;
	raw_name: string;
	display_name: string | null;
}

export type CustomCard = Omit<Partial<ScryfallCard>, 'object'> & {
	object: 'custom_card';
	id: string;
	name: string;
	custom: CustomCardMeta;
};

export function isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard {
	return card.object === 'custom_card';
}
