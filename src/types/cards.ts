import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { MtgLanguage } from '@/lib/mtg/languages';
import type { CustomCard } from '@/lib/mpc/types';

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

// A face of a multi-face card (transform/split/adventure/DFC). Mirrors what the DB
// assembler produces per face.
export interface CardFace {
	name?: string;
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	colors?: string[];
	power?: string;
	toughness?: string;
	loyalty?: string;
	artist?: string;
	illustration_id?: string;
	image_uris?: { small: string; normal: string; large: string };
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

// A related card (token / meld part / meld result / combo piece).
export interface CardPart {
	id: string; // the related print id
	component: string; // token | meld_part | meld_result | combo_piece
	name: string;
	type_line: string;
}

// Provider-neutral Magic card (a specific print). Flat — same field names the app reads
// today — so migrating consumers off ScryfallCard is a near-drop-in. Provider-specific
// fields (scryfall_uri, prints_search_uri, uri, rulings_uri, set URIs) and volatile prices
// are intentionally NOT here.
export interface Card {
	// identity
	id: string;
	oracle_id: string;
	name: string;
	lang: string;
	layout: string;
	// gameplay
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	cmc?: number;
	colors?: string[];
	color_identity?: string[];
	keywords?: string[];
	power?: string;
	toughness?: string;
	loyalty?: string;
	defense?: string;
	legalities?: unknown;
	reserved?: boolean;
	edhrec_rank?: number;
	// print
	set: string;
	set_name?: string;
	collector_number: string;
	rarity?: string;
	released_at?: string;
	artist?: string;
	frame?: string;
	border_color?: string;
	image_status?: string;
	image_uris?: { small: string; normal: string; large: string };
	finishes?: string[];
	foil?: boolean;
	nonfoil?: boolean;
	promo?: boolean;
	reprint?: boolean;
	variation?: boolean;
	digital?: boolean;
	// localized
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
	// multi-face + relations
	card_faces?: CardFace[];
	all_parts?: CardPart[];
	// external ids
	multiverse_ids?: number[];
	mtgo_id?: number;
	arena_id?: number;
	tcgplayer_id?: number;
	cardmarket_id?: number;
}

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
	ownerId?: string;
	wishlist?: boolean;
}

// One copy in the collection = Scryfall print data + per-copy metadata
export type CardCopy = (ScryfallCard | CustomCard) & { entry: CardEntry };

// All copies of a card with the same oracle_id (potentially different editions)
export interface CardStack {
	oracleId: string; // stable grouping key
	name: string; // display name (from first card in stack)
	cards: CardCopy[]; // copies — may be different editions
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
