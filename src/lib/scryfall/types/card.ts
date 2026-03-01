// Application-level card types for collection management

import type {
	ScryfallSet,
	ScryfallCard,
	ScryfallUUID,
	ScryfallColors,
	ScryfallLegalities,
	ScryfallImageUris,
	ScryfallPrices,
} from './scryfall';

export type MTGCardRarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

export interface MTGCard {
	id: string;
	name: string;
	set: string;
	setName?: string;
	collectorNumber?: string;
	rarity?: MTGCardRarity;
	manaCost?: string;
	convertedManaCost?: number;
	type: string;
	subtypes?: string[];
	power?: string;
	toughness?: string;
	text?: string;
	flavor?: string;
	imageUrl?: string;
	prices?: {
		usd?: string;
		eur?: string;
	};

	// Scryfall extensions (optional)
	scryfallId?: ScryfallUUID;
	oracleId?: ScryfallUUID;
	colors?: ScryfallColors;
	colorIdentity?: ScryfallColors;
	keywords?: string[];
	legalities?: ScryfallLegalities;
	scryfallData?: ScryfallCard;

	// Custom metadata from SQL import
	condition?: string;
	tags?: string[];
	dateAdded?: string;
	isFoil?: boolean;
	isEtched?: boolean;
	lang?: string;
}

export interface EnhancedMTGCard extends Omit<MTGCard, 'scryfallData'> {
	scryfallData: ScryfallCard;
	// Computed properties from Scryfall
	imageUris?: ScryfallImageUris;
	allPrices?: ScryfallPrices;
	artist?: string;
	collectorNumber?: string;
	released?: string;
	fullArt?: boolean;
	foil?: boolean;
	nonfoil?: boolean;
	reserved?: boolean;
	etched?: boolean;
}

export interface MTGSet {
	code: string;
	name: string;
	releaseDate: string;
	totalCards: number;
	iconUrl?: string;

	// Scryfall extensions (optional)
	scryfallId?: ScryfallUUID;
	setType?: string;
	digital?: boolean;
	foilOnly?: boolean;
	scryfallData?: ScryfallSet;
}

export interface EnhancedMTGSet extends Omit<MTGSet, 'scryfallData'> {
	scryfallData: ScryfallSet;
	parentSetCode?: string;
	block?: string;
	printedSize?: number;
}

export interface CollectionStats {
	totalCards: number;
	uniqueCards: number;
	uniqueByEdition: number;
	setCount: number;
	rarityDistribution: Record<string, number>;
	colorDistribution?: Record<string, number>;
	typeDistribution?: Record<string, number>;
}

export interface StackedCard extends MTGCard {
	quantity: number;
	instanceIds: string[];
}
