'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CardStack, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

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
 * Owns the wishlist "move to collection" flow: maps a rowId back to its stack,
 * holds the stack currently being moved (drives the `<EditCardModal>`), and
 * commits the move. `onAfterMove` lets the page close the card modal too.
 */
export function useMoveToCollection(
	stacks: CardStack[],
	moveToCollection: (rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => void,
	onAfterMove: () => void
) {
	const [movingStack, setMovingStack] = useState<CardStack | null>(null);

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
			if (stack) setMovingStack(stack);
		},
		[stackByRowId]
	);

	const confirmMove = useCallback(
		(selectedPrint: ScryfallCard, entry: Partial<CardEntry>, count: number) => {
			if (!movingStack) return;
			const rowIds = movingStack.cards.slice(0, count).map((c) => c.entry.rowId);
			moveToCollection(rowIds, selectedPrint.id, entry);
			setMovingStack(null);
			onAfterMove();
		},
		[movingStack, moveToCollection, onAfterMove]
	);

	const cancel = useCallback(() => setMovingStack(null), []);

	return { movingStack, requestMove, confirmMove, cancel, buildInitialEntry };
}
