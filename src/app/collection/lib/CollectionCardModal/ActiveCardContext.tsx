'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { CardStack } from '@/types/cards';

type ActiveCardContextValue = {
	/** The card stack whose modal is currently open, or null when closed. */
	activeStack: CardStack | null;
	openCard: (stack: CardStack) => void;
	closeCard: () => void;
};

const ActiveCardContext = createContext<ActiveCardContextValue | null>(null);

/**
 * Minimal UI-state context holding only the currently-open card modal. Kept
 * separate from CollectionCardsContext (data) so modal logic never bloats the
 * derived-data context. `useCardModal` consumes this instead of owning the
 * open state, which lets a card click (in the grid) and the modal render (a
 * sibling) share the same source without prop-drilling.
 */
export function ActiveCardProvider({ children }: { children: React.ReactNode }) {
	const [activeStack, setActiveStack] = useState<CardStack | null>(null);

	const openCard = useCallback((stack: CardStack) => setActiveStack(stack), []);
	const closeCard = useCallback(() => setActiveStack(null), []);

	const value = useMemo<ActiveCardContextValue>(
		() => ({ activeStack, openCard, closeCard }),
		[activeStack, openCard, closeCard]
	);

	return <ActiveCardContext.Provider value={value}>{children}</ActiveCardContext.Provider>;
}

export function useActiveCardContext(): ActiveCardContextValue {
	const ctx = useContext(ActiveCardContext);
	if (!ctx) throw new Error('useActiveCardContext must be used within an ActiveCardProvider');
	return ctx;
}
