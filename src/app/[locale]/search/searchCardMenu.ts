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

/** Libellés du menu carte, résolus par l'appelant via useTranslations('cardMenu'). */
export type CardMenuLabels = {
	viewDetails: string;
	openCardPage: string;
	addToCollection: string;
	addToWishlist: string;
	addToDeck: string;
};

export function buildSearchMenuItems(
	card: AnyCard,
	handlers: SearchCardMenuHandlers,
	close: () => void,
	labels: CardMenuLabels
): ContextMenuAction[] {
	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: labels.viewDetails,
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
			label: labels.openCardPage,
			icon: '🔗',
			onClick: () => {
				handlers.onOpenCardPage(card);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: labels.addToCollection,
			icon: '▣',
			onClick: () => {
				handlers.onAddToCollection(card);
				close();
			},
		},
		{
			type: 'action',
			label: labels.addToWishlist,
			icon: '♡',
			onClick: () => {
				handlers.onAddToWishlist(card);
				close();
			},
		},
		{
			type: 'action',
			label: labels.addToDeck,
			icon: '🗂',
			onClick: () => {
				handlers.onAddToDeck(card);
				close();
			},
		}
	);

	return items;
}
