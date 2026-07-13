import type { BadgeState } from '@/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
import type { Card } from '@/types/cards';

/**
 * Badge state for a single deck copy (not a group):
 * owned if this copy is owned, else wishlist if its print is wishlisted, else none.
 */
export function getCopyBadgeState(
	copy: Card,
	wishlistScryfallIds: ReadonlySet<string>
): BadgeState {
	if (copy.entry.ownerId != null) return 'owned';
	if (wishlistScryfallIds.has(copy.id)) return 'wishlist';
	return 'none';
}
