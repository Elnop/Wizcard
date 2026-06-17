import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { CardStack, CardEntry } from '@/types/cards';

export type WishlistCardMenuHandlers = {
	onViewDetails: (stack: CardStack) => void;
	onAddCopy: (scryfallId: string, sourceEntry: CardEntry) => void;
	onRemoveCopy: (rowId: string) => void;
	onMoveToCollection: (rowId: string) => void;
	onChangePrint: (stack: CardStack) => void;
	onRemoveFromWishlist: (rowId: string) => void;
};

export function buildWishlistMenuItems(
	stack: CardStack,
	handlers: WishlistCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const rep = stack.cards[0];
	if (!rep) return [];

	return [
		{
			type: 'action',
			label: 'Voir les détails',
			icon: '👁',
			onClick: () => {
				handlers.onViewDetails(stack);
				close();
			},
		},
		{
			type: 'action',
			label: 'Ajouter une copie',
			icon: '+',
			onClick: () => {
				handlers.onAddCopy(rep.id, rep.entry);
				close();
			},
		},
		{
			type: 'action',
			label: 'Retirer une copie',
			icon: '−',
			onClick: () => {
				handlers.onRemoveCopy(rep.entry.rowId);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Déplacer vers la collection',
			icon: '→',
			onClick: () => {
				handlers.onMoveToCollection(rep.entry.rowId);
				close();
			},
		},
		{
			type: 'action',
			label: "Changer l'édition",
			icon: '✎',
			onClick: () => {
				handlers.onChangePrint(stack);
				close();
			},
		},
		{
			type: 'action',
			label: 'Retirer de la wishlist',
			icon: '🗑',
			danger: true,
			onClick: () => {
				handlers.onRemoveFromWishlist(rep.entry.rowId);
				close();
			},
		},
	];
}
