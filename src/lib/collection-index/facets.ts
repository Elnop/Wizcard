import type { Card, CardFacets, MtgColor } from '@/types/cards';

/** Row shape returned by the `card_facets` RPC. */
export interface CardFacetsRow {
	id: string;
	oracle_id: string;
	name: string;
	lang: string;
	layout: string | null;
	set: string;
	collector_number: string;
	rarity: string | null;
	released_at: string | null;
	artist: string | null;
	promo: boolean | null;
	digital: boolean | null;
	cmc: number | null;
	colors: string[] | null;
	color_identity: string[] | null;
	type_line: string | null;
	oracle_text: string | null;
	power: string | null;
	toughness: string | null;
	edhrec_rank: number | null;
}

/** Logical-card key: oracle_id when known, else the print id (custom cards). */
export function oracleKeyOf(card: { oracle_id?: string; id: string }): string {
	return card.oracle_id ?? card.id;
}

/** Facets of an assembled Card. Field order is fixed so JSON comparisons are stable. */
export function facetsFromCard(card: Card): CardFacets {
	return {
		id: card.id,
		oracle_id: card.oracle_id,
		name: card.name,
		lang: card.lang,
		layout: card.layout,
		set: card.set,
		collector_number: card.collector_number,
		rarity: card.rarity,
		released_at: card.released_at,
		artist: card.artist,
		promo: card.promo,
		digital: card.digital,
		cmc: card.cmc,
		colors: card.colors,
		color_identity: card.color_identity,
		type_line: card.type_line,
		oracle_text: card.oracle_text,
		power: card.power,
		toughness: card.toughness,
		edhrec_rank: card.edhrec_rank,
	};
}

/** RPC row → facets, mapping NULL → undefined exactly like rowsToCard does. */
export function facetRowToFacets(row: CardFacetsRow): CardFacets {
	return {
		id: row.id,
		oracle_id: row.oracle_id,
		name: row.name,
		lang: row.lang,
		layout: row.layout ?? 'normal',
		set: row.set,
		collector_number: row.collector_number,
		rarity: row.rarity ?? undefined,
		released_at: row.released_at ?? undefined,
		artist: row.artist ?? undefined,
		promo: row.promo ?? undefined,
		digital: row.digital ?? undefined,
		cmc: row.cmc ?? undefined,
		colors: (row.colors as MtgColor[] | null) ?? undefined,
		color_identity: (row.color_identity as MtgColor[] | null) ?? undefined,
		type_line: row.type_line ?? undefined,
		oracle_text: row.oracle_text ?? undefined,
		power: row.power ?? undefined,
		toughness: row.toughness ?? undefined,
		edhrec_rank: row.edhrec_rank ?? undefined,
	};
}
