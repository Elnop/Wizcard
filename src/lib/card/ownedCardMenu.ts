import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { Card, CardStack } from '@/types/cards';

export type OwnedCardMenuMode = 'collection' | 'wishlist';

/**
 * Handlers for the owned-card menu (collection + wishlist). Each receives the
 * stack's representative `Card` (`stack.cards[0]`) so the caller can pull either
 * its scryfall id (`rep.id`) or its row id (`rep.entry.rowId`) as needed — the
 * collection and wishlist mutations key on different ids, so passing the card
 * keeps the contract uniform.
 */
export type OwnedCardMenuHandlers = {
	onViewDetails: (stack: CardStack) => void;
	onAddCopy: (rep: Card) => void;
	onRemoveCopy: (rep: Card) => void;
	/** Move to the *other* list: wishlist when mode='collection', collection when 'wishlist'. */
	onMove: (rep: Card) => void;
	onAddToDeck: (stack: CardStack) => void;
	onChangePrint: (stack: CardStack) => void;
	onRemove: (rep: Card) => void;
};

const LABELS = {
	collection: { move: 'Déplacer vers la wishlist', remove: 'Retirer de la collection' },
	wishlist: { move: 'Déplacer vers la collection', remove: 'Retirer de la wishlist' },
} as const;

const MOVE_ICONS = { collection: '♡', wishlist: '→' } as const;

/**
 * Builds the right-click menu shared by the collection and wishlist pages. The
 * two are mirror images (7 actions, move/remove targets swapped), so a single
 * `mode`-parameterised builder replaces the two near-identical builders.
 */
export function buildOwnedCardMenu(
	stack: CardStack,
	mode: OwnedCardMenuMode,
	handlers: OwnedCardMenuHandlers,
	close: () => void
): ContextMenuAction[] {
	const rep = stack.cards[0];
	if (!rep) return [];

	const run = (fn: () => void) => () => {
		fn();
		close();
	};

	return [
		{
			type: 'action',
			label: 'Voir les détails',
			icon: '👁',
			onClick: run(() => handlers.onViewDetails(stack)),
		},
		{
			type: 'action',
			label: 'Ajouter une copie',
			icon: '+',
			onClick: run(() => handlers.onAddCopy(rep)),
		},
		{
			type: 'action',
			label: 'Retirer une copie',
			icon: '−',
			onClick: run(() => handlers.onRemoveCopy(rep)),
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: LABELS[mode].move,
			icon: MOVE_ICONS[mode],
			onClick: run(() => handlers.onMove(rep)),
		},
		{
			type: 'action',
			label: 'Ajouter à un deck…',
			icon: '🗂',
			onClick: run(() => handlers.onAddToDeck(stack)),
		},
		{
			type: 'action',
			label: "Changer l'édition",
			icon: '✎',
			onClick: run(() => handlers.onChangePrint(stack)),
		},
		{
			type: 'action',
			label: LABELS[mode].remove,
			icon: '🗑',
			danger: true,
			onClick: run(() => handlers.onRemove(rep)),
		},
	];
}
