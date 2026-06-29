'use client';

import { useCallback, useMemo } from 'react';
import type { CardStack, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';

function buildInitialEntry(entry: CardEntry): Partial<CardEntry> {
	// Strip identity/ownership fields so the new collection copy is minted fresh.
	// Other metadata (forTrade, purchasePrice, alter, …) intentionally carries
	// over from the wishlist copy even though the modal does not expose it for
	// editing — a "for trade" wishlist card stays "for trade" once collected.
	const patch: Partial<CardEntry> = { ...entry };
	delete patch.rowId;
	delete patch.dateAdded;
	delete patch.deckId;
	delete patch.ownerId;
	delete patch.wishlist;
	return patch;
}

/**
 * Wishlist "move to collection" flow. `requestMove(rowId)` resolves the row's
 * stack and opens the (global) add-card modal pre-filled from the wishlist copy;
 * confirming commits the move and closes the card modal via `onAfterMove`.
 */
export function useMoveToCollection(
	stacks: CardStack[],
	moveToCollection: (rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => void,
	onAfterMove: () => void
) {
	const { openAddCard } = useAddCardModal();

	const stackByRowId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			for (const card of stack.cards) map.set(card.entry.rowId, stack);
		}
		return map;
	}, [stacks]);

	const requestMove = useCallback(
		(rowId: string) => {
			const stack = stackByRowId.get(rowId);
			const rep = stack?.cards[0];
			if (!stack || !rep) return;
			openAddCard({
				scryfallCard: rep as ScryfallCard,
				initialEntry: buildInitialEntry(rep.entry),
				maxQuantity: stack.cards.length,
				hideQuantity: stack.cards.length <= 1,
				onAdd: (selectedPrint, entry, count) => {
					const rowIds = stack.cards.slice(0, count).map((c) => c.entry.rowId);
					moveToCollection(rowIds, selectedPrint.id, entry);
					onAfterMove();
				},
			});
		},
		[stackByRowId, openAddCard, moveToCollection, onAfterMove]
	);

	return { requestMove };
}
