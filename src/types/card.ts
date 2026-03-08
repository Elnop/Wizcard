import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

// Only data persisted in localStorage — nothing from Scryfall except the ID
export interface CollectionEntry {
	id: string; // Scryfall UUID — lookup key
	quantity: number;
	dateAdded: string; // ISO timestamp
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	condition?: string;
	language?: string;
	purchasePrice?: string;
	tradelistCount?: number;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}

// Runtime type — full Scryfall data merged with collection metadata
// NOT what is stored in localStorage
export type Card = ScryfallCard & CollectionEntry;

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

// Extract only the persistable fields from a ScryfallCard + metadata
export function toCollectionEntry(
	card: ScryfallCard,
	meta: Omit<CollectionEntry, 'id'>
): CollectionEntry {
	return { id: card.id, ...meta };
}
