'use client';

import { useMemo } from 'react';
import type { Card, CardStack } from '@/types/cards';
import { useCardMutations } from '@/lib/card/hooks/useCardMutations';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useMoveToCollection } from '@/app/wishlist/useMoveToCollection';
import type { OwnedCardMenuHandlers, OwnedCardMenuMode } from '@/lib/card/ownedCardMenu';

/**
 * Owner card-menu handlers (collection + wishlist), extracted so the standalone
 * owner pages AND the signed-in user's own profile view share one wiring. Mirrors
 * `src/app/collection/page.tsx` / `src/app/wishlist/page.tsx`:
 *
 * - collection: add/remove copy via `mutations.collection.*`, move → wishlist.
 * - wishlist: add/remove copy via `mutations.wishlist.*`, move → collection via
 *   the `useMoveToCollection` flow (needs the live `stacks` to resolve the row).
 *
 * `onViewDetails` / `onChangePrint` open the editable card modal (the caller owns
 * this data), so we open it WITHOUT `readOnly`.
 */
export function useOwnedCardMenuHandlers(
	stacks: CardStack[],
	mode: OwnedCardMenuMode
): OwnedCardMenuHandlers {
	const mutations = useCardMutations();
	const { moveToCollection } = useWishlistContext();
	const { openAddToDeck } = useAddToDeckModal();
	const { openCardModal, close: closeCardModal } = useCardModalContext();
	const move = useMoveToCollection(stacks, moveToCollection, closeCardModal);

	return useMemo<OwnedCardMenuHandlers>(() => {
		const onViewDetails = (stack: CardStack) => openCardModal(stack.cards);
		if (mode === 'collection') {
			return {
				onViewDetails,
				onAddCopy: (rep: Card) => mutations.collection.duplicate(rep.id, rep.entry),
				onRemoveCopy: (rep: Card) => mutations.collection.decrement(rep.id),
				onMove: (rep: Card) => mutations.moveToWishlist(rep.entry.rowId),
				onAddToDeck: (s: CardStack) => openAddToDeck(s.cards[0]),
				onChangePrint: onViewDetails,
				onRemove: (rep: Card) => mutations.collection.remove(rep.id),
			};
		}
		return {
			onViewDetails,
			onAddCopy: (rep: Card) => mutations.wishlist.duplicate(rep.id, rep.entry),
			onRemoveCopy: (rep: Card) => mutations.wishlist.remove(rep.entry.rowId),
			onMove: (rep: Card) => move.requestMove(rep.entry.rowId),
			onAddToDeck: (s: CardStack) => openAddToDeck(s.cards[0]),
			onChangePrint: onViewDetails,
			onRemove: (rep: Card) => mutations.wishlist.remove(rep.entry.rowId),
		};
	}, [mode, mutations, openAddToDeck, openCardModal, move]);
}
