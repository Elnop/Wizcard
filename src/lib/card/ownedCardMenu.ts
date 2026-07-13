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

const MOVE_ICONS = { collection: '♡', wishlist: '→' } as const;

/** Libellés du menu propriétaire, résolus par l'appelant (useOwnedCardMenuLabels). */
export type OwnedCardMenuLabels = {
	viewDetails: string;
	addCopy: string;
	removeCopy: string;
	addToDeck: string;
	changePrint: string;
	/** Selon le mode : "Déplacer vers la liste de souhaits" / "…vers la collection". */
	move: string;
	/** Selon le mode : "Retirer de la collection" / "…de la liste de souhaits". */
	remove: string;
};

/**
 * Builds the right-click menu shared by the collection and wishlist pages. The
 * two are mirror images (7 actions, move/remove targets swapped), so a single
 * `mode`-parameterised builder replaces the two near-identical builders.
 * Les libellés (dont `move`/`remove` dépendants du mode) sont résolus par
 * l'appelant et passés dans `labels`.
 */
export function buildOwnedCardMenu(
	stack: CardStack,
	mode: OwnedCardMenuMode,
	handlers: OwnedCardMenuHandlers,
	close: () => void,
	labels: OwnedCardMenuLabels
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
			label: labels.viewDetails,
			icon: '👁',
			onClick: run(() => handlers.onViewDetails(stack)),
		},
		{
			type: 'action',
			label: labels.addCopy,
			icon: '+',
			onClick: run(() => handlers.onAddCopy(rep)),
		},
		{
			type: 'action',
			label: labels.removeCopy,
			icon: '−',
			onClick: run(() => handlers.onRemoveCopy(rep)),
		},
		{ type: 'divider' },
		{
			type: 'action',
			label: labels.move,
			icon: MOVE_ICONS[mode],
			onClick: run(() => handlers.onMove(rep)),
		},
		{
			type: 'action',
			label: labels.addToDeck,
			icon: '🗂',
			onClick: run(() => handlers.onAddToDeck(stack)),
		},
		{
			type: 'action',
			label: labels.changePrint,
			icon: '✎',
			onClick: run(() => handlers.onChangePrint(stack)),
		},
		{
			type: 'action',
			label: labels.remove,
			icon: '🗑',
			danger: true,
			onClick: run(() => handlers.onRemove(rep)),
		},
	];
}
