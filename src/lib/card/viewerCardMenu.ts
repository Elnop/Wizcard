import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { isCustomCard } from '@/lib/mpc/types';

/**
 * Handlers for the "viewer" card menu — the menu shown on ANOTHER user's public
 * profile (collection / wishlist), where the actions act on the *signed-in
 * user's own* lists, not the profile owner's. Mirrors `buildSearchMenuItems`
 * (search results are likewise cards you don't own yet), minus "Open card page".
 */
export type ViewerCardMenuHandlers = {
	onViewDetails: (card: AnyCard) => void;
	onAddToCollection: (card: AnyCard) => void;
	onAddToWishlist: (card: AnyCard) => void;
	onAddToDeck: (card: AnyCard) => void;
};

/**
 * Builds the right-click menu for cards on someone else's profile. Custom cards
 * / cardbacks aren't Scryfall-tracked, so only "View details" applies to them.
 */
export function buildViewerCardMenu(
	card: AnyCard,
	handlers: ViewerCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const run = (fn: () => void) => () => {
		fn();
		close();
	};

	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: 'View details',
			icon: '👁',
			onClick: run(() => handlers.onViewDetails(card)),
		},
	];

	if (isCustomCard(card)) {
		return items;
	}

	items.push(
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Add to my collection…',
			icon: '▣',
			onClick: run(() => handlers.onAddToCollection(card)),
		},
		{
			type: 'action',
			label: 'Add to my wishlist…',
			icon: '♡',
			onClick: run(() => handlers.onAddToWishlist(card)),
		},
		{
			type: 'action',
			label: 'Add to my deck…',
			icon: '🗂',
			onClick: run(() => handlers.onAddToDeck(card)),
		}
	);

	return items;
}
