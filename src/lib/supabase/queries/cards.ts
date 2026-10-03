import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';
import { remainingPageStarts } from './page-starts';

/**
 * Raw Supabase access for the `card_entries` table and its public view. This
 * file is the ONLY place that issues
 * client.from('card_entries'|'public_collection_cards') calls; domain mapping
 * (row <-> CardEntry) lives in collection/db + wishlist/db.
 */

export async function fetchCardRowsPage(
	table: 'card_entries' | 'public_collection_cards',
	filter: { ownerId: string; from: number; pageSize: number }
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from(table)
		.select('*')
		.eq('owner_id', filter.ownerId)
		.eq('wishlist', false)
		.order('id')
		.range(filter.from, filter.from + filter.pageSize - 1);

	if (error) {
		console.error(`[queries/cards] fetchCardRowsPage(${table}) error:`, error);
		return { rows: [], hasMore: false };
	}
	return { rows: data as CardDbRow[], hasMore: data.length === filter.pageSize };
}

/**
 * Public, read-only page of a given owner's STANDALONE wishlist cards (owner_id
 * = ownerId, wishlist = true), read via the price-free `public_collection_cards`
 * view. Deck-flagged wishlist cards (owner_id null) are intentionally excluded —
 * the shared wishlist shows only the owner's own standalone wants.
 */
export async function fetchPublicWishlistCardRowsPage(
	ownerId: string,
	from: number,
	pageSize: number
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('public_collection_cards')
		.select('*')
		.eq('owner_id', ownerId)
		.eq('wishlist', true)
		.order('id')
		.range(from, from + pageSize - 1);

	if (error) {
		console.error('[queries/cards] fetchPublicWishlistCardRowsPage error:', error);
		return { rows: [], hasMore: false };
	}
	return { rows: data as CardDbRow[], hasMore: data.length === pageSize };
}

/**
 * Exact count of a given owner's public collection (`wishlist=false`) or
 * wishlist (`wishlist=true`) cards, via a head-only query (no rows fetched).
 * Used by the profile page to show section totals without loading all cards.
 */
export async function fetchPublicCardCount(ownerId: string, wishlist: boolean): Promise<number> {
	const supabase = createClient();
	const { count, error } = await supabase
		.from('public_collection_cards')
		.select('*', { count: 'exact', head: true })
		.eq('owner_id', ownerId)
		.eq('wishlist', wishlist);

	if (error) {
		console.error('[queries/cards] fetchPublicCardCount error:', error);
		return 0;
	}
	return count ?? 0;
}

export const CARD_ROWS_PAGE_SIZE = 1000;

/** The signed-in owner's row sets that are always loaded whole. */
export type OwnerRowSet = 'collection' | 'wishlist';

async function fetchOwnerRowsRange(
	set: OwnerRowSet,
	userId: string,
	from: number,
	withCount: boolean
): Promise<{ rows: CardDbRow[]; count: number | null }> {
	const supabase = createClient();
	const base = supabase
		.from('card_entries')
		.select('*', withCount ? { count: 'exact' } : undefined);
	// A wishlist row is a standalone wishlist card (owner_id = userId) OR a deck card
	// flagged wishlist in place (owner_id null, deck_id set); RLS scopes the latter.
	const scoped =
		set === 'collection'
			? base.eq('owner_id', userId).eq('wishlist', false)
			: base.eq('wishlist', true).or(`owner_id.eq.${userId},deck_id.not.is.null`);
	const { data, error, count } = await scoped
		.order('id')
		.range(from, from + CARD_ROWS_PAGE_SIZE - 1);
	if (error) throw new Error(`[queries/cards] ${set} rows from ${from}: ${error.message}`);
	return { rows: (data ?? []) as CardDbRow[], count };
}

/**
 * Every row of the owner's collection or wishlist. The first page carries the exact
 * count, the remaining pages are fetched in parallel, then any rows inserted after the
 * count are picked up serially until a short page. Throws on any page error — a
 * partial set must never be mistaken for the whole collection.
 */
export async function fetchAllOwnerRows(set: OwnerRowSet, userId: string): Promise<CardDbRow[]> {
	const first = await fetchOwnerRowsRange(set, userId, 0, true);
	if (first.rows.length < CARD_ROWS_PAGE_SIZE) return first.rows;

	const starts = remainingPageStarts(first.count ?? 0, CARD_ROWS_PAGE_SIZE);
	const pages = await Promise.all(
		starts.map((from) => fetchOwnerRowsRange(set, userId, from, false))
	);
	const rows = [...first.rows, ...pages.flatMap((p) => p.rows)];

	let last = pages.at(-1) ?? first;
	let next = CARD_ROWS_PAGE_SIZE * (starts.length + 1);
	while (last.rows.length === CARD_ROWS_PAGE_SIZE) {
		last = await fetchOwnerRowsRange(set, userId, next, false);
		rows.push(...last.rows);
		next += CARD_ROWS_PAGE_SIZE;
	}
	return rows;
}

export async function insertCardRows(rows: Record<string, unknown>[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('card_entries').insert(rows);
	if (error) {
		throw new Error(`[queries/cards] insertCardRows error: ${error.message}`);
	}
}

export async function deleteCardRowsByIds(ownerId: string, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase
		.from('card_entries')
		.delete()
		.eq('owner_id', ownerId)
		.in('id', ids);
	if (error) {
		throw new Error(`[queries/cards] deleteCardRowsByIds error: ${error.message}`);
	}
}

export async function updateCardRow(
	ownerId: string,
	rowId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('card_entries')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', rowId);
	if (error) {
		throw new Error(`[queries/cards] updateCardRow error: ${error.message}`);
	}
}

/**
 * Exact count of an owner's DISTINCT public prints (scryfall_id) via the
 * count_distinct_public_cards RPC. Used by the profile Overview "unique cards"
 * stat; the plain fetchPublicCardCount gives total copies (rows).
 */
export async function fetchDistinctPublicCardCount(ownerId: string): Promise<number> {
	const supabase = createClient();
	const { data, error } = await supabase.rpc('count_distinct_public_cards', { owner: ownerId });
	if (error) {
		console.error('[queries/cards] fetchDistinctPublicCardCount error:', error);
		return 0;
	}
	return (data as number | null) ?? 0;
}

/**
 * The `limit` most recently added public collection rows for an owner
 * (wishlist=false), newest first. Read via the price-free public view; used by
 * the profile Overview "recently added" strip.
 */
export async function fetchRecentPublicCardRows(
	ownerId: string,
	limit: number
): Promise<CardDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('public_collection_cards')
		.select('*')
		.eq('owner_id', ownerId)
		.eq('wishlist', false)
		.order('date_added', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('[queries/cards] fetchRecentPublicCardRows error:', error);
		return [];
	}
	return data as CardDbRow[];
}
