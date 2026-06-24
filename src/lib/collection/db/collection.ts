import type { CardEntry } from '@/types/cards';
import { createClient } from '@/lib/supabase/client';
import {
	type CardDbRow,
	rowToCardEntry,
	cardEntryToRow,
	normalizeCondition,
} from '@/lib/card/db/cardRow';

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchCollectionPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('owner_id', userId)
		.eq('wishlist', false)
		.range(from, from + DB_FETCH_PAGE_SIZE - 1);

	if (error) {
		console.error('[collection] fetchCollectionPage error:', error);
		return { rows: [], hasMore: false };
	}

	const rows = (data as CardDbRow[]).map((row) => ({
		scryfallId: row.scryfall_id,
		entry: rowToCardEntry(row),
	}));
	return { rows, hasMore: data.length === DB_FETCH_PAGE_SIZE };
}

/**
 * Public, read-only variant of {@link fetchCollectionPage}: reads the
 * `public_collection_cards` view (which omits `purchase_price`) so a visitor
 * can view any user's collection without their financial data. Mirrors the
 * owner collection page semantics (excludes wishlist rows).
 */
export async function fetchPublicCollectionPage(
	ownerId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('public_collection_cards')
		.select('*')
		.eq('owner_id', ownerId)
		.eq('wishlist', false)
		.range(from, from + DB_FETCH_PAGE_SIZE - 1);

	if (error) {
		console.error('[collection] fetchPublicCollectionPage error:', error);
		return { rows: [], hasMore: false };
	}

	const rows = (data as CardDbRow[]).map((row) => ({
		scryfallId: row.scryfall_id,
		entry: rowToCardEntry(row),
	}));
	return { rows, hasMore: data.length === DB_FETCH_PAGE_SIZE };
}

export async function insertEntry(
	userId: string,
	scryfallId: string,
	entry: CardEntry,
	wishlist = false
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert({
		...cardEntryToRow(scryfallId, entry),
		owner_id: userId,
		wishlist,
	});

	if (error) {
		throw new Error(`[collection] insertEntry error: ${error.message}`);
	}
}

const INSERT_BATCH_SIZE = 500;

export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>,
	wishlist = false
): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		const { error } = await supabase.from('cards').insert(
			batch.map((r) => ({
				...cardEntryToRow(r.scryfallId, r.entry),
				owner_id: userId,
				wishlist,
			}))
		);
		if (error) {
			throw new Error(`[collection] insertEntries error: ${error.message}`);
		}
	}
}

export async function deleteEntryById(userId: string, rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('owner_id', userId).eq('id', rowId);

	if (error) {
		throw new Error(`[collection] deleteEntryById error: ${error.message}`);
	}
}

const DELETE_BATCH_SIZE = 50;

export async function deleteEntries(userId: string, rowIds: string[]): Promise<void> {
	if (rowIds.length === 0) return;
	const supabase = createClient();
	for (let i = 0; i < rowIds.length; i += DELETE_BATCH_SIZE) {
		const batch = rowIds.slice(i, i + DELETE_BATCH_SIZE);
		const { error } = await supabase.from('cards').delete().eq('owner_id', userId).in('id', batch);
		if (error) {
			throw new Error(`[collection] deleteEntries error: ${error.message}`);
		}
	}
}

export async function updateEntry(
	userId: string,
	rowId: string,
	entry: CardEntry,
	scryfallId?: string
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update({
			date_added: entry.dateAdded,
			is_foil: entry.isFoil ?? null,
			foil_type: entry.foilType ?? null,
			condition: normalizeCondition(entry.condition),
			language: entry.language ?? null,
			purchase_price: entry.purchasePrice ?? null,
			for_trade: entry.forTrade ?? null,
			alter: entry.alter ?? null,
			proxy: entry.proxy ?? null,
			tags: entry.tags ?? null,
			deck_id: entry.deckId ?? null,
			// Changing the print (edition) must patch the existing row in place so the
			// card keeps its identity (rowId) across collection/deck/wishlist views.
			...(scryfallId !== undefined ? { scryfall_id: scryfallId } : {}),
		})
		.eq('owner_id', userId)
		.eq('id', rowId);

	if (error) {
		throw new Error(`[collection] updateEntry error: ${error.message}`);
	}
}
