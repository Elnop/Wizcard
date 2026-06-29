'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CardStack } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';

type DeckModalState = { card: ScryfallCard; ownedRowIds: string[] } | null;

/**
 * Orchestrates the "add to deck" flow shared by the collection and wishlist
 * pages: holds the modal state, maps a card back to its stack, and exposes the
 * two ways to open the modal (from a stack, or from a single card). The
 * `<AddToDeckModal>` itself stays rendered in the page so the page keeps an
 * explicit view of what it displays — the hook only owns the state.
 *
 * `onAssign` is passed through for callers (wishlist) whose rows have
 * owner_id=NULL and need a custom assignment path; collection omits it.
 */
export function useAddToDeckModal(
	stacks: CardStack[],
	onAssign?: (rowIds: string[], deckId: string, zone: DeckZone) => void
) {
	const [deckModal, setDeckModal] = useState<DeckModalState>(null);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of stacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [stacks]);

	const openForStack = useCallback((stack: CardStack) => {
		const rep = stack.cards[0];
		if (!rep) return;
		setDeckModal({
			card: rep as ScryfallCard,
			ownedRowIds: stack.cards.map((c) => c.entry.rowId),
		});
	}, []);

	const openForCard = useCallback(
		(card: ScryfallCard) => {
			const stack = stackByCardId.get(card.id);
			if (stack) openForStack(stack);
			else setDeckModal({ card, ownedRowIds: [] });
		},
		[stackByCardId, openForStack]
	);

	const close = useCallback(() => setDeckModal(null), []);

	return { deckModal, openForStack, openForCard, close, onAssign };
}
