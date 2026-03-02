import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

// Applicative type: Scryfall data + collection metadata
export interface Card extends ScryfallCard {
	quantity?: number;
	dateAdded?: string;
	isFoil?: boolean;
	condition?: string;
	tags?: string[];
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
