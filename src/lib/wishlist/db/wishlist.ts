import type { CardEntry } from '@/types/cards';
import { rowToCardEntry } from '@/lib/card/db/cardRow';
import { fetchWishlistCardRowsPage } from '@/lib/supabase/queries/cards';

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchWishlistPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	// A wishlist row may be a standalone wishlist card (owner_id = userId) OR a
	// deck card flagged wishlist in place (owner_id null, deck_id set). The latter
	// is reachable via deck ownership; RLS already restricts visibility to the
	// user's own rows, so the deck-card branch can match on deck_id presence.
	const { rows, hasMore } = await fetchWishlistCardRowsPage(userId, from, DB_FETCH_PAGE_SIZE);
	return {
		rows: rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) })),
		hasMore,
	};
}
