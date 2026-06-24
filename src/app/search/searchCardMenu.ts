import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { isCustomCard } from '@/lib/mpc/types';

export type SearchCardMenuHandlers = {
	onViewDetails: (card: AnyCard) => void;
	onOpenCardPage: (card: AnyCard) => void;
	onAddToCollection: (card: AnyCard) => void;
	onAddToWishlist: (card: AnyCard) => void;
};

export function buildSearchMenuItems(
	card: AnyCard,
	handlers: SearchCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const items: ContextMenuAction[] = [
		{
			type: 'action',
			label: 'Voir les détails',
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
			label: 'Ouvrir la page de la carte',
			icon: '🔗',
			onClick: () => {
				handlers.onOpenCardPage(card);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Ajouter à la collection…',
			icon: '▣',
			onClick: () => {
				handlers.onAddToCollection(card);
				close();
			},
		},
		{
			type: 'action',
			label: 'Ajouter à la wishlist…',
			icon: '♡',
			onClick: () => {
				handlers.onAddToWishlist(card);
				close();
			},
		}
	);

	return items;
}
