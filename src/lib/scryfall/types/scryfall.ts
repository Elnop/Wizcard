// Scryfall API types based on https://scryfall.com/docs/api

// Base types
export type ScryfallUUID = string;
export type ScryfallColor = 'W' | 'U' | 'B' | 'R' | 'G';
export type ScryfallColors = ScryfallColor[];
export type ScryfallRarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
export type ScryfallLayout =
	| 'normal'
	| 'split'
	| 'flip'
	| 'transform'
	| 'modal_dfc'
	| 'meld'
	| 'leveler'
	| 'class'
	| 'saga'
	| 'adventure'
	| 'planar'
	| 'scheme'
	| 'vanguard'
	| 'token'
	| 'double_faced_token'
	| 'emblem'
	| 'augment'
	| 'host';
export type ScryfallFrameEffect =
	| 'legendary'
	| 'miracle'
	| 'nyxtouched'
	| 'draft'
	| 'devoid'
	| 'tombstone'
	| 'colorshifted'
	| 'inverted'
	| 'sunmoondfc'
	| 'compasslanddfc'
	| 'originpwdfc'
	| 'mooneldrazidfc'
	| 'waxingandwaningmoondfc'
	| 'showcase'
	| 'extendedart'
	| 'companion'
	| 'etched'
	| 'snow'
	| 'lesson'
	| 'shatteredglass'
	| 'convertdfc'
	| 'fandfc'
	| 'upsidedowndfc';
export type ScryfallFrame = '1993' | '1997' | '2003' | '2015' | 'future';
export type ScryfallSecurityStamp = 'oval' | 'triangle' | 'acorn' | 'arena' | 'heart';
export type ScryfallBorderColor = 'black' | 'white' | 'borderless' | 'silver' | 'gold';
export type ScryfallImageStatus = 'missing' | 'placeholder' | 'lowres' | 'highres_scan';
export type ScryfallLegality = 'legal' | 'not_legal' | 'restricted' | 'banned';
export type ScryfallGame = 'paper' | 'arena' | 'mtgo';
export type ScryfallFormat =
	| 'standard'
	| 'future'
	| 'historic'
	| 'gladiator'
	| 'pioneer'
	| 'explorer'
	| 'modern'
	| 'legacy'
	| 'pauper'
	| 'vintage'
	| 'penny'
	| 'commander'
	| 'oathbreaker'
	| 'brawl'
	| 'historicbrawl'
	| 'alchemy'
	| 'paupercommander'
	| 'duel'
	| 'oldschool'
	| 'premodern'
	| 'predh';

export interface ScryfallImageUris {
	small: string;
	normal: string;
	large: string;
	png: string;
	art_crop: string;
	border_crop: string;
}

export interface ScryfallPrices {
	usd?: string;
	usd_foil?: string;
	usd_etched?: string;
	eur?: string;
	eur_foil?: string;
	eur_etched?: string;
	tix?: string;
}

export type ScryfallLegalities = Record<ScryfallFormat, ScryfallLegality>;

export interface ScryfallCardFace {
	artist?: string;
	artist_id?: ScryfallUUID;
	cmc?: number;
	color_indicator?: ScryfallColors;
	colors?: ScryfallColors;
	defense?: string;
	flavor_text?: string;
	illustration_id?: ScryfallUUID;
	image_uris?: ScryfallImageUris;
	layout?: ScryfallLayout;
	loyalty?: string;
	mana_cost: string;
	name: string;
	object: 'card_face';
	oracle_id?: ScryfallUUID;
	oracle_text?: string;
	power?: string;
	printed_name?: string;
	printed_text?: string;
	printed_type_line?: string;
	toughness?: string;
	type_line?: string;
	watermark?: string;
}

export interface ScryfallRelatedCard {
	id: ScryfallUUID;
	object: 'related_card';
	component: 'token' | 'meld_part' | 'meld_result' | 'combo_piece';
	name: string;
	type_line: string;
	uri: string;
}

export interface ScryfallCard {
	// Identifiers
	id: ScryfallUUID;
	oracle_id: ScryfallUUID;
	multiverse_ids?: number[];
	mtgo_id?: number;
	mtgo_foil_id?: number;
	tcgplayer_id?: number;
	tcgplayer_etched_id?: number;
	cardmarket_id?: number;
	arena_id?: number;

	// Core metadata
	object: 'card';
	name: string;
	lang: string;
	released_at: string;
	uri: string;
	scryfall_uri: string;
	layout: ScryfallLayout;

	// Visual data
	image_uris?: ScryfallImageUris;
	image_status: ScryfallImageStatus;
	mana_cost?: string;
	cmc: number;
	type_line: string;
	oracle_text?: string;
	flavor_text?: string;
	colors?: ScryfallColors;
	color_identity: ScryfallColors;
	color_indicator?: ScryfallColors;

	// Gameplay
	keywords: string[];
	legalities: ScryfallLegalities;
	games: ScryfallGame[];
	reserved: boolean;
	foil: boolean;
	nonfoil: boolean;
	finishes: string[];
	oversized: boolean;
	promo: boolean;
	reprint: boolean;
	variation: boolean;

	// Set info
	set_id: ScryfallUUID;
	set: string;
	set_name: string;
	set_type: string;
	set_uri: string;
	set_search_uri: string;
	scryfall_set_uri: string;
	rulings_uri: string;
	prints_search_uri: string;

	// Collection & print
	collector_number: string;
	digital: boolean;
	rarity: ScryfallRarity;
	artist?: string;
	artist_ids?: ScryfallUUID[];
	illustration_id?: ScryfallUUID;
	border_color: ScryfallBorderColor;
	frame: ScryfallFrame;
	frame_effects?: ScryfallFrameEffect[];
	security_stamp?: ScryfallSecurityStamp;
	full_art: boolean;
	textless: boolean;
	booster: boolean;
	story_spotlight: boolean;
	edhrec_rank?: number;
	penny_rank?: number;

	// Game-specific data
	power?: string;
	toughness?: string;
	loyalty?: string;
	life_modifier?: string;
	hand_modifier?: string;
	color_indicator_names?: string[];

	// Pricing & availability
	prices: ScryfallPrices;
	related_uris: Record<string, string>;
	purchase_uris?: Record<string, string>;

	// Multi-face cards
	card_faces?: ScryfallCardFace[];

	// Additional
	watermark?: string;
	preview?: {
		previewed_at: string;
		source_uri: string;
		source: string;
	};
	all_parts?: ScryfallRelatedCard[];
	produced_mana?: ScryfallColors;
}

export interface ScryfallSet {
	id: ScryfallUUID;
	code: string;
	mtgo_code?: string;
	tcgplayer_id?: number;
	name: string;
	set_type: string;
	released_at?: string;
	block_code?: string;
	block?: string;
	parent_set_code?: string;
	card_count: number;
	printed_size?: number;
	digital: boolean;
	foil_only: boolean;
	nonfoil_only?: boolean;
	scryfall_uri: string;
	uri: string;
	icon_svg_uri: string;
	search_uri: string;
}

export interface ScryfallSearchOptions {
	q: string;
	unique?: 'cards' | 'art' | 'prints';
	order?:
		| 'name'
		| 'set'
		| 'released'
		| 'rarity'
		| 'color'
		| 'usd'
		| 'eur'
		| 'tix'
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
	pretty?: boolean;
}

export interface ScryfallList<T> {
	object: 'list';
	total_cards?: number;
	has_more: boolean;
	next_page?: string;
	data: T[];
	warnings?: string[];
	not_found?: ScryfallCardIdentifier[];
}

export type ScryfallCardSearchResult = ScryfallList<ScryfallCard>;
export type ScryfallSetSearchResult = ScryfallList<ScryfallSet>;

export interface ScryfallCatalog {
	object: 'catalog';
	uri: string;
	total_values: number;
	data: string[];
}

export interface ScryfallRuling {
	object: 'ruling';
	oracle_id: ScryfallUUID;
	source: 'wotc' | 'scryfall';
	published_at: string;
	comment: string;
}

export interface ScryfallManaCost {
	object: 'mana_cost';
	cost: string;
	cmc: number;
	colors: ScryfallColors;
	colorless: boolean;
	monocolored: boolean;
	multicolored: boolean;
}

export interface ScryfallManaSymbol {
	object: 'card_symbol';
	symbol: string;
	loose_variant?: string;
	english: string;
	transposable: boolean;
	represents_mana: boolean;
	appears_in_mana_costs: boolean;
	cmc?: number;
	mana_value?: number;
	funny: boolean;
	colors: ScryfallColors;
	hybrid?: boolean;
	phyrexian?: boolean;
	svg_uri?: string;
}

export type ScryfallCardSymbol = ScryfallManaSymbol;

export interface ScryfallCardIdentifier {
	id?: ScryfallUUID;
	mtgo_id?: number;
	multiverse_id?: number;
	oracle_id?: ScryfallUUID;
	illustration_id?: ScryfallUUID;
	name?: string;
	set?: string;
	collector_number?: string;
}

export interface ScryfallImageOptions {
	format?: 'json' | 'image';
	face?: 'front' | 'back';
	version?: 'small' | 'normal' | 'large' | 'png' | 'art_crop' | 'border_crop';
	pretty?: boolean;
}

export interface ScryfallError {
	object: 'error';
	code: string;
	status: number;
	details: string;
	type?: string;
	warnings?: string[];
}

export interface ScryfallBulkData {
	object: 'bulk_data';
	id: ScryfallUUID;
	uri: string;
	type: 'oracle_cards' | 'unique_artwork' | 'default_cards' | 'all_cards' | 'rulings';
	name: string;
	description: string;
	download_uri: string;
	updated_at: string;
	size: number;
	content_type: string;
	content_encoding: string;
}
