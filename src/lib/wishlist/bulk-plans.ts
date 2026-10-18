// src/lib/wishlist/bulk-plans.ts
import type { CardEntry } from '@/types/cards';

/**
 * Same rule as `removeFromWishlist`: a wishlist row that is also a deck card
 * keeps living in its deck and only loses its wishlist flag. Pure wishlist rows
 * are deleted.
 */
export function planWishlistRemove(
	copies: Array<{ rowId: string; entry: CardEntry }>,
	isLoadedDeckCard: (rowId: string) => boolean
): { deleteIds: string[]; unflagIds: string[] } {
	const deleteIds: string[] = [];
	const unflagIds: string[] = [];
	for (const { rowId, entry } of copies) {
		if (entry.deckId != null || isLoadedDeckCard(rowId)) unflagIds.push(rowId);
		else deleteIds.push(rowId);
	}
	return { deleteIds, unflagIds };
}
