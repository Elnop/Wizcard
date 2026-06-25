import type { CardEntry } from '@/types/cards';
import {
	type CardDbRow,
	rowToCardEntry,
	cardEntryToRow,
	normalizeCondition,
} from '@/lib/card/db/cardRow';
import {
	fetchCardRowsPage,
	insertCardRows,
	deleteCardRowsByIds,
	updateCardRow,
} from '@/lib/supabase/queries/cards';

const DB_FETCH_PAGE_SIZE = 1000;

function mapRows(rows: CardDbRow[]): Array<{ scryfallId: string; entry: CardEntry }> {
	return rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) }));
}

export async function fetchCollectionPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const { rows, hasMore } = await fetchCardRowsPage('cards', {
		ownerId: userId,
		from,
		pageSize: DB_FETCH_PAGE_SIZE,
	});
	return { rows: mapRows(rows), hasMore };
}

/**
 * Public, read-only variant: reads the `public_collection_cards` view (omits
 * `purchase_price`) so a visitor can view any user's collection without their
 * financial data. Excludes wishlist rows, mirroring the owner page.
 */
export async function fetchPublicCollectionPage(
	ownerId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const { rows, hasMore } = await fetchCardRowsPage('public_collection_cards', {
		ownerId,
		from,
		pageSize: DB_FETCH_PAGE_SIZE,
	});
	return { rows: mapRows(rows), hasMore };
}

export async function insertEntry(
	userId: string,
	scryfallId: string,
	entry: CardEntry,
	wishlist = false
): Promise<void> {
	await insertCardRows([{ ...cardEntryToRow(scryfallId, entry), owner_id: userId, wishlist }]);
}

const INSERT_BATCH_SIZE = 500;

export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>,
	wishlist = false
): Promise<void> {
	if (rows.length === 0) return;
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		await insertCardRows(
			batch.map((r) => ({ ...cardEntryToRow(r.scryfallId, r.entry), owner_id: userId, wishlist }))
		);
	}
}

export async function deleteEntryById(userId: string, rowId: string): Promise<void> {
	await deleteCardRowsByIds(userId, [rowId]);
}

const DELETE_BATCH_SIZE = 50;

export async function deleteEntries(userId: string, rowIds: string[]): Promise<void> {
	if (rowIds.length === 0) return;
	for (let i = 0; i < rowIds.length; i += DELETE_BATCH_SIZE) {
		await deleteCardRowsByIds(userId, rowIds.slice(i, i + DELETE_BATCH_SIZE));
	}
}

export async function updateEntry(
	userId: string,
	rowId: string,
	entry: CardEntry,
	scryfallId?: string
): Promise<void> {
	await updateCardRow(userId, rowId, {
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
	});
}
