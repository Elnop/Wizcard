'use client';

import { useState, useCallback, useMemo } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { putCardsInCache } from '@/lib/scryfall/card-cache';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import type { CardStack, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export function useCardModal(stacks: CardStack[]) {
	const {
		addCard,
		duplicateEntry,
		decrementCard,
		removeCard,
		removeEntry,
		updateEntry,
		changePrint,
	} = useCollectionContext();

	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);
	const [pendingScryfallCard, setPendingScryfallCard] = useState<ScryfallCard | null>(null);

	const resolvedStack = useMemo<CardStack | null>(() => {
		if (!selectedStack) return null;
		const fromStacks = stacks.find((s) => s.name === selectedStack.name) ?? null;
		if (fromStacks) return fromStacks;
		if (pendingScryfallCard) {
			const newStack = stacks.find((s) => s.name === pendingScryfallCard.name) ?? null;
			if (newStack) return newStack;
		}
		return null;
	}, [selectedStack, stacks, pendingScryfallCard]);

	const handleCardClick = useCallback((stack: CardStack) => setSelectedStack(stack), []);

	const handleCloseModal = useCallback(() => {
		setSelectedStack(null);
		setPendingScryfallCard(null);
	}, []);

	const handleSaveModal = useCallback(
		(rowId: string, updates: Partial<CardEntry>) => updateEntry(rowId, updates),
		[updateEntry]
	);

	const handleRemoveModal = useCallback(
		(scryfallId: string) => {
			removeCard(scryfallId);
			setSelectedStack(null);
			setPendingScryfallCard(null);
		},
		[removeCard]
	);

	const handleIncrementModal = useCallback(() => {
		if (resolvedStack && resolvedStack.cards.length > 0) {
			addCard(resolvedStack.cards[0]);
		}
	}, [resolvedStack, addCard]);

	const handleDecrementModal = useCallback(() => {
		if (resolvedStack && resolvedStack.cards.length > 0) {
			decrementCard(resolvedStack.cards[0].id);
		}
	}, [resolvedStack, decrementCard]);

	const handleDuplicateEntry = useCallback(
		(scryfallId: string, entry: CardEntry) => duplicateEntry(scryfallId, entry),
		[duplicateEntry]
	);

	const handleRemoveEntry = useCallback((rowId: string) => removeEntry(rowId), [removeEntry]);

	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard) => {
			void putCardsInCache([newCard]);
			setPendingScryfallCard(newCard);
			const language = newCard.lang ? SCRYFALL_CODE_TO_LANGUAGE[newCard.lang] : undefined;
			changePrint(rowId, newCard.id, language ? { language } : undefined);
			setSelectedStack({ oracleId: newCard.oracle_id, name: newCard.name, cards: [] });
		},
		[changePrint]
	);

	return {
		resolvedStack,
		handleCardClick,
		handleCloseModal,
		handleSaveModal,
		handleRemoveModal,
		handleIncrementModal,
		handleDecrementModal,
		handleDuplicateEntry,
		handleRemoveEntry,
		handleChangePrint,
	};
}
