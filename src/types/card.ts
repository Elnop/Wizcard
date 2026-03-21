import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

// Per-copy metadata — fields persisted per row in the DB
export interface StackMeta {
	dateAdded: string; // ISO timestamp
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	condition?: string;
	language?: string;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
}

// One logical stack: all copies of a given scryfall_id in the collection
export interface CollectionStack {
	scryfallId: string; // Scryfall UUID — lookup key
	count: number;
	meta: StackMeta;
	rowIds: string[]; // one per physical copy
}

// Runtime type — full Scryfall data merged with collection metadata (flattened)
// NOT what is stored in localStorage
export type Card = ScryfallCard & Omit<CollectionStack, 'meta'> & StackMeta;

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
