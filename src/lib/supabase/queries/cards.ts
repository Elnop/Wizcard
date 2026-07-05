import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';

/**
 * Raw Supabase access for the `cards` table and its public view. This file is
 * the ONLY place that issues client.from('cards'|'public_collection_cards')
 * calls; domain mapping (row <-> CardEntry) lives in collection/db + wishlist/db.
 */

export async function fetchCardRowsPage(
	table: 'cards' | 'public_collection_cards',
	filter: { ownerId: string; from: number; pageSize: number }
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from(table)
		.select('*')
		.eq('owner_id', filter.ownerId)
		.eq('wishlist', false)
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

export async function fetchWishlistCardRowsPage(
	userId: string,
	from: number,
	pageSize: number
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('wishlist', true)
		.or(`owner_id.eq.${userId},deck_id.not.is.null`)
		.range(from, from + pageSize - 1);

	if (error) {
		console.error('[queries/cards] fetchWishlistCardRowsPage error:', error);
		return { rows: [], hasMore: false };
	}
	return { rows: data as CardDbRow[], hasMore: data.length === pageSize };
}

export async function insertCardRows(rows: Record<string, unknown>[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(rows);
	if (error) {
		throw new Error(`[queries/cards] insertCardRows error: ${error.message}`);
	}
}

export async function deleteCardRowsByIds(ownerId: string, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('owner_id', ownerId).in('id', ids);
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
		.from('cards')
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
