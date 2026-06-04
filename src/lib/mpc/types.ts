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
	sourceId: string | null;
	imageUrl: string;
	isCustom: true;
	oracleId?: string;
	sourceType: CardSourceType;
	isPublic: boolean;
	createdBy?: string;
	cardType: CardType;
	language: string | null;
}

export interface MpcIndexEntry {
	identifier: string; // Google Drive file ID
	name: string; // Normalized card name (for matching)
	rawName: string; // Original name from mpcfill
	sourceName: string; // e.g. "TwoSheds"
	sourceKey: string; // e.g. "TwoSheds"
	smallThumbnailUrl: string;
	mediumThumbnailUrl: string;
	tags: string[];
	dpi: number;
}

import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

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
}

export type CustomCard = Partial<ScryfallCard> & {
	object: 'custom_card';
	id: string;
	name: string;
	custom: CustomCardMeta;
};

export function isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard {
	return (card as { object?: string }).object === 'custom_card';
}
