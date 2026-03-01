// Scryfall API parameter types for each endpoint

export interface ScryfallCacheEntry<T> {
	data: T;
	timestamp: number;
}

export interface ScryfallSearchParams {
	q: string;
	unique?: 'cards' | 'art' | 'prints';
	order?:
		| 'name'
		| 'set'
		| 'released'
		| 'rarity'
		| 'color'
		| 'usd'
		| 'tix'
		| 'eur'
		| 'cmc'
		| 'power'
		| 'toughness'
		| 'edhrec'
		| 'penny'
		| 'artist'
		| 'review';
	dir?: 'auto' | 'asc' | 'desc';
	include_extras?: boolean;
	include_multilingual?: boolean;
	include_variations?: boolean;
	page?: number;
	format?: 'json' | 'csv';
}

export interface ScryfallNamedCardParams {
	exact?: string;
	fuzzy?: string;
	set?: string;
}

export interface ScryfallAutocompleteParams {
	q: string;
	include_extras?: boolean;
}

export interface ScryfallCollectionParams {
	identifiers: Array<{
		id?: string;
		mtgo_id?: number;
		multiverse_id?: number;
		oracle_id?: string;
		illustration_id?: string;
		name?: string;
		set?: string;
		collector_number?: string;
	}>;
}

export interface ScryfallCatalogParams {
	catalog_name:
		| 'card-names'
		| 'artist-names'
		| 'word-bank'
		| 'creature-types'
		| 'planeswalker-types'
		| 'land-types'
		| 'artifact-types'
		| 'enchantment-types'
		| 'spell-types'
		| 'powers'
		| 'toughnesses'
		| 'loyalties'
		| 'watermarks'
		| 'keyword-abilities'
		| 'keyword-actions'
		| 'ability-words';
}

export type ScryfallCatalogType =
	| 'card-names'
	| 'artist-names'
	| 'word-bank'
	| 'creature-types'
	| 'planeswalker-types'
	| 'land-types'
	| 'artifact-types'
	| 'enchantment-types'
	| 'spell-types'
	| 'powers'
	| 'toughnesses'
	| 'loyalties'
	| 'watermarks'
	| 'keyword-abilities'
	| 'keyword-actions'
	| 'ability-words'
	| 'flavor-words'
	| 'card-types';
