import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { CardStack, CardEntry } from '@/types/cards';

export type CollectionCardMenuHandlers = {
	onViewDetails: (stack: CardStack) => void;
	onAddCopy: (scryfallId: string, sourceEntry: CardEntry) => void;
	onRemoveCopy: (scryfallId: string) => void;
	onMoveToWishlist: (rowId: string) => void;
	onAddToDeck: (stack: CardStack) => void;
	onChangePrint: (stack: CardStack) => void;
	onRemoveFromCollection: (scryfallId: string) => void;
};

export function buildCollectionMenuItems(
	stack: CardStack,
	handlers: CollectionCardMenuHandlers,
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
				handlers.onRemoveCopy(rep.id);
				close();
			},
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: 'Déplacer vers la wishlist',
			icon: '♡',
			onClick: () => {
				handlers.onMoveToWishlist(rep.entry.rowId);
				close();
			},
		},
		{
			type: 'action',
			label: 'Ajouter à un deck…',
			icon: '🗂',
			onClick: () => {
				handlers.onAddToDeck(stack);
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
			label: 'Retirer de la collection',
			icon: '🗑',
			danger: true,
			onClick: () => {
				handlers.onRemoveFromCollection(rep.id);
				close();
			},
		},
	];
}
