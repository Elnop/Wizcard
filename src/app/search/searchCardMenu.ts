import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { isCustomCard } from '@/lib/mpc/types';

export type SearchCardMenuHandlers = {
	onViewDetails: (card: AnyCard) => void;
	onOpenCardPage: (card: AnyCard) => void;
	onAddToCollection: (card: AnyCard) => void;
	onAddToWishlist: (card: AnyCard) => void;
	onAddToDeck: (card: AnyCard) => void;
};

export function buildSearchMenuItems(
	card: AnyCard,
	handlers: SearchCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: 'View details',
			icon: '👁',
			onClick: () => {
				handlers.onViewDetails(card);
				close();
			},
		},
	];

	// Custom cards / cardbacks have no Scryfall page and aren't tracked in
	// the collection or wishlist — only "view details" applies.
	if (isCustomCard(card)) {
		return items;
	}

	items.push(
		{
			type: 'action',
			label: 'Open card page',
			icon: '🔗',
			onClick: () => {
				handlers.onOpenCardPage(card);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Add to collection…',
			icon: '▣',
			onClick: () => {
				handlers.onAddToCollection(card);
				close();
			},
		},
		{
			type: 'action',
			label: 'Add to wishlist…',
			icon: '♡',
			onClick: () => {
				handlers.onAddToWishlist(card);
				close();
			},
		},
		{
			type: 'action',
			label: 'Add to deck…',
			icon: '🗂',
			onClick: () => {
				handlers.onAddToDeck(card);
				close();
			},
		}
	);

	return items;
}
