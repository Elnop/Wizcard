import type { CardEntry } from '@/types/cards';
import { rowToCardEntry } from '@/lib/card/db/cardRow';
import { fetchAllOwnerRows, fetchPublicWishlistCardRowsPage } from '@/lib/supabase/queries/cards';

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchAllWishlistEntries(
	userId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const rows = await fetchAllOwnerRows('wishlist', userId);
	return rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) }));
}

/**
 * Public, read-only variant: a given owner's standalone wishlist cards via the
 * price-free public view. Mirrors `fetchPublicCollectionPage`.
 */
export async function fetchPublicWishlistPage(
	ownerId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const { rows, hasMore } = await fetchPublicWishlistCardRowsPage(
		ownerId,
		from,
		DB_FETCH_PAGE_SIZE
	);
	return {
		rows: rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) })),
		hasMore,
	};
}
