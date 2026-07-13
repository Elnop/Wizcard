'use client';

import { createContext, useContext, useMemo } from 'react';
import type { CardStack } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';

type CollectionCardsContextValue = {
	/** Hydrated, grouped stacks derived from the collection entries. */
	stacks: CardStack[];
	/** Scryfall hydration in progress. */
	isLoading: boolean;
	/** Total entries expected (skeleton count hint). */
	totalExpected: number;
};

const CollectionCardsContext = createContext<CollectionCardsContextValue | null>(null);

/**
 * Single source of truth for the owner's hydrated collection stacks. Thin
 * adapter around the existing `useCollectionCards` hook (whose Scryfall
 * hydration logic is unchanged) so the page, its view and the card modal all
 * read the same derived data without prop-drilling.
 */
export function CollectionCardsProvider({ children }: { children: React.ReactNode }) {
	const { entries } = useCollectionContext();
	const { stacks, isLoading, totalExpected } = useCollectionCards(entries);

	const value = useMemo<CollectionCardsContextValue>(
		() => ({ stacks, isLoading, totalExpected }),
		[stacks, isLoading, totalExpected]
	);

	return (
		<CollectionCardsContext.Provider value={value}>{children}</CollectionCardsContext.Provider>
	);
}

export function useCollectionCardsContext(): CollectionCardsContextValue {
	const ctx = useContext(CollectionCardsContext);
	if (!ctx)
		throw new Error('useCollectionCardsContext must be used within a CollectionCardsProvider');
	return ctx;
}
