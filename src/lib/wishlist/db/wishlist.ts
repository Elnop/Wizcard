import type { CardEntry } from '@/types/cards';
import { createClient } from '@/lib/supabase/client';
import { type CardDbRow, rowToCardEntry } from '@/lib/card/db/cardRow';

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchWishlistPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const supabase = createClient();
	// A wishlist row may be a standalone wishlist card (owner_id = userId) OR a
	// deck card flagged wishlist in place (owner_id null, deck_id set). The latter
	// is reachable via deck ownership; RLS already restricts visibility to the
	// user's own rows, so the deck-card branch can match on deck_id presence.
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('wishlist', true)
		.or(`owner_id.eq.${userId},deck_id.not.is.null`)
		.range(from, from + DB_FETCH_PAGE_SIZE - 1);

	if (error) {
		console.error('[wishlist] fetchWishlistPage error:', error);
		return { rows: [], hasMore: false };
	}

	const rows = (data as CardDbRow[]).map((row) => ({
		scryfallId: row.scryfall_id,
		entry: rowToCardEntry(row),
	}));
	return { rows, hasMore: data.length === DB_FETCH_PAGE_SIZE };
}
