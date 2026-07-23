// Pure normalization: a Scryfall card object -> catalog rows for the four tables.
// No DB, no I/O. Faces are read from card.card_faces (printed_* + per-face image
// when present); split/adventure keep 2 face rows but only the root image (their
// faces have no image_uris), while transform/modal_dfc/reversible carry image_uris
// on each face.

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
}

export interface CardFaceRow {
	print_id: string;
	face_index: number;
	name: string | null;
	type_line: string | null;
	oracle_text: string | null;
	mana_cost: string | null;
	colors: string[] | null;
	power: string | null;
	toughness: string | null;
	loyalty: string | null;
	artist: string | null;
	illustration_id: string | null;
	image_uris: Img3 | null;
	printed_name: string | null;
	printed_type_line: string | null;
	printed_text: string | null;
}

const KEPT_LANGS = new Set(['en', 'fr']);

export function toCatalogRows(
	card: ScryfallCard
): { definition: CardDefinitionRow; print: CardPrintRow; faces: CardFaceRow[] } | null {
	if (!card.id || !card.oracle_id || !card.set || !card.collector_number) return null;
	if (!KEPT_LANGS.has(card.lang)) return null;
	if (!card.games?.includes('paper')) return null;

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
	};

	const faces: CardFaceRow[] = (card.card_faces ?? []).map((f, i) => ({
		print_id: card.id,
		face_index: i,
		name: f.name ?? null,
		type_line: f.type_line ?? null,
		oracle_text: f.oracle_text ?? null,
		mana_cost: f.mana_cost ?? null,
		colors: f.colors ?? null,
		power: f.power ?? null,
		toughness: f.toughness ?? null,
		loyalty: f.loyalty ?? null,
		artist: f.artist ?? null,
		illustration_id: f.illustration_id ?? null,
		image_uris: pick3(f.image_uris),
		printed_name: f.printed_name ?? null,
		printed_type_line: f.printed_type_line ?? null,
		printed_text: f.printed_text ?? null,
	}));

	return { definition, print, faces };
}
