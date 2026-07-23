// Pure normalization: a Scryfall card object -> catalog rows for the five tables.
// No DB, no I/O. Faces are read from card.card_faces and split into definitionFaces
// (gameplay, invariant per oracle) + printFaces (printed_* + per-face image when
// present); split/adventure keep 2 face rows but only the root image (their faces
// have no image_uris), while transform/modal_dfc/reversible carry image_uris on
// each face.

import type { ScryfallCard, ScryfallImageUris } from '@/lib/scryfall/types/scryfall';

type Img3 = Pick<ScryfallImageUris, 'small' | 'normal' | 'large'>;

function pick3(uris: ScryfallImageUris | undefined): Img3 | null {
	if (!uris) return null;
	return { small: uris.small, normal: uris.normal, large: uris.large };
}

export interface CardDefinitionRow {
	oracle_id: string;
	name: string;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	cmc: number | null;
	colors: string[] | null;
	color_identity: string[] | null;
	keywords: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
	defense: string | null;
	legalities: unknown;
	reserved: boolean | null;
	edhrec_rank: number | null;
	layout: string | null;
}

export interface CardPrintRow {
	id: string;
	oracle_id: string;
	set: string;
	collector_number: string;
	lang: string;
	rarity: string | null;
	released_at: string | null;
	artist: string | null;
	border_color: string | null;
	frame: string | null;
	image_status: string | null;
	image_uris: Img3 | null;
	finishes: string[] | null;
	promo: boolean | null;
	reprint: boolean | null;
	variation: boolean | null;
	digital: boolean | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
	multiverse_ids: number[] | null;
	mtgo_id: number | null;
	arena_id: number | null;
	tcgplayer_id: number | null;
	cardmarket_id: number | null;
}

export interface CardDefinitionFaceRow {
	oracle_id: string;
	face_index: number;
	name: string | null;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	colors: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
}

export interface CardPrintFaceRow {
	print_id: string;
	face_index: number;
	artist: string | null;
	illustration_id: string | null;
	image_uris: Img3 | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

const KEPT_LANGS = new Set(['en', 'fr']);

export function toCatalogRows(card: ScryfallCard): {
	definition: CardDefinitionRow;
	print: CardPrintRow;
	definitionFaces: CardDefinitionFaceRow[];
	printFaces: CardPrintFaceRow[];
} | null {
	if (!card.id || !card.oracle_id || !card.set || !card.collector_number) return null;
	if (!KEPT_LANGS.has(card.lang)) return null;
	if (!card.games?.includes('paper')) return null;
	// art_series cards are collector art objects, not playable cards: no gameplay
	// (type_line "Card", no cost/text), never in a deck, never a card_parts endpoint.
	// They produce empty definition_faces (2 blank faces each) and only pollute the
	// catalog — skip them. Their own oracle_id is never shared with a real card.
	if (card.layout === 'art_series') return null;

	const definition: CardDefinitionRow = {
		oracle_id: card.oracle_id,
		name: card.name,
		type_line: card.type_line ?? null,
		oracle_text: card.oracle_text ?? null,
		mana_cost: card.mana_cost ?? null,
		cmc: card.cmc ?? null,
		colors: card.colors ?? null,
		color_identity: card.color_identity ?? null,
		keywords: card.keywords ?? null,
		power: card.power ?? null,
		toughness: card.toughness ?? null,
		loyalty: card.loyalty ?? null,
		defense: card.defense ?? null,
		legalities: card.legalities ?? null,
		reserved: card.reserved ?? null,
		edhrec_rank: card.edhrec_rank ?? null,
		layout: card.layout ?? null,
	};

	const print: CardPrintRow = {
		id: card.id,
		oracle_id: card.oracle_id,
		set: card.set,
		collector_number: card.collector_number,
		lang: card.lang,
		rarity: card.rarity ?? null,
		released_at: card.released_at ?? null,
		artist: card.artist ?? null,
		border_color: card.border_color ?? null,
		frame: card.frame ?? null,
		image_status: card.image_status ?? null,
		image_uris: pick3(card.image_uris),
		finishes: card.finishes ?? null,
		promo: card.promo ?? null,
		reprint: card.reprint ?? null,
		variation: card.variation ?? null,
		digital: card.digital ?? null,
		printed_name: card.printed_name ?? null,
		printed_type_line: card.printed_type_line ?? null,
		printed_text: card.printed_text ?? null,
		multiverse_ids: card.multiverse_ids ?? null,
		mtgo_id: card.mtgo_id ?? null,
		arena_id: card.arena_id ?? null,
		tcgplayer_id: card.tcgplayer_id ?? null,
		cardmarket_id: card.cardmarket_id ?? null,
	};

	const definitionFaces: CardDefinitionFaceRow[] = (card.card_faces ?? []).map((f, i) => ({
		oracle_id: card.oracle_id,
		face_index: i,
		name: f.name ?? null,
		type_line: f.type_line ?? null,
		oracle_text: f.oracle_text ?? null,
		mana_cost: f.mana_cost ?? null,
		colors: f.colors ?? null,
		power: f.power ?? null,
		toughness: f.toughness ?? null,
		loyalty: f.loyalty ?? null,
	}));

	const printFaces: CardPrintFaceRow[] = (card.card_faces ?? []).map((f, i) => ({
		print_id: card.id,
		face_index: i,
		artist: f.artist ?? null,
		illustration_id: f.illustration_id ?? null,
		image_uris: pick3(f.image_uris),
		printed_name: f.printed_name ?? null,
		printed_type_line: f.printed_type_line ?? null,
		printed_text: f.printed_text ?? null,
	}));

	return { definition, print, definitionFaces, printFaces };
}
