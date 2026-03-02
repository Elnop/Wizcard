import type {
	ScryfallCard,
	ScryfallImageUris,
	ScryfallCardFace,
	ScryfallRarity,
} from '@/lib/scryfall/types/scryfall';

// Slim card stored in localStorage — only fields needed for display + stats
export interface StoredCard {
	// Identity
	id: string;
	name: string;
	set: string;
	set_name: string;
	collector_number: string;
	rarity: ScryfallRarity;
	lang?: string;
	// Display
	image_uris?: Pick<ScryfallImageUris, 'small' | 'normal' | 'large'>;
	card_faces?: Array<Pick<ScryfallCardFace, 'name' | 'image_uris'>>;
	// Collection metadata
	quantity?: number;
	dateAdded?: string;
	isFoil?: boolean;
	condition?: string;
	tags?: string[];
}

// Legacy full-card shape — kept for migration compat, Card = StoredCard in new code
export type Card = StoredCard;

// Aggregated collection statistics
export interface CollectionStats {
	totalCards: number;
	uniqueCards: number;
	uniqueByEdition: number;
	setCount: number;
	rarityDistribution: Record<string, number>;
	colorDistribution?: Record<string, number>;
	typeDistribution?: Record<string, number>;
}

// Project a full ScryfallCard down to the slim StoredCard shape
export function toStoredCard(
	card: ScryfallCard
): Omit<StoredCard, 'quantity' | 'dateAdded' | 'isFoil' | 'condition' | 'tags'> {
	return {
		id: card.id,
		name: card.name,
		set: card.set,
		set_name: card.set_name,
		collector_number: card.collector_number,
		rarity: card.rarity,
		lang: card.lang,
		image_uris: card.image_uris
			? {
					small: card.image_uris.small,
					normal: card.image_uris.normal,
					large: card.image_uris.large,
				}
			: undefined,
		card_faces: card.card_faces?.map((f) => ({ name: f.name, image_uris: f.image_uris })),
	};
}
