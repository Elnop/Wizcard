import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { MtgLanguage } from '@/lib/mtg/languages';

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

// Metadata for a single physical copy
export interface CardEntry {
	rowId: string;
	dateAdded: string;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	condition?: CardCondition;
	language?: MtgLanguage;
	purchasePrice?: string;
	forTrade?: boolean;
	alter?: boolean;
	proxy?: boolean;
	tags?: string[];
	deckId?: string;
}

// One copy in the collection = Scryfall print data + per-copy metadata
export type Card = ScryfallCard & { entry: CardEntry };

// All copies of a card with the same oracle_id (potentially different editions)
export interface CardStack {
	oracleId: string; // stable grouping key
	name: string; // display name (from first card in stack)
	cards: Card[]; // copies — may be different editions
}

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
