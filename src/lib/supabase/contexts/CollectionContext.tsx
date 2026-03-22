'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useCollectionStore } from '@/lib/supabase/collection-store';
import type { CollectionData } from '@/lib/supabase/collection-migrations';

// Bound collection API — userId and triggerSync are already captured
type CollectionContextValue = {
	collection: CollectionData;
	entries: Array<{ scryfallId: string; entry: CardEntry }>;
	isLoaded: boolean;
	addCard: (card: ScryfallCard) => void;
	duplicateEntry: (scryfallId: string, sourceEntry: CardEntry) => void;
	removeCard: (scryfallId: string) => void;
	decrementCard: (scryfallId: string) => void;
	removeEntry: (rowId: string) => void;
	updateEntry: (rowId: string, updates: Partial<CardEntry>) => void;
	changePrint: (oldScryfallId: string, newScryfallId: string) => void;
	clearCollection: () => void;
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;
	getQuantity: (scryfallId: string) => number;
};

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const userId = user?.id ?? null;

	const store = useCollectionStore();
	const prevUserIdRef = useRef<string | null | undefined>(undefined);

	// Hydrate / logout handling on auth change
	useEffect(() => {
		if (authLoading) return;

		const prevUserId = prevUserIdRef.current;
		prevUserIdRef.current = userId;

		if (!userId) {
			store.handleLogout(userId);
			return;
		}

		// User switched accounts — wipe local state first
		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			useCollectionStore.setState({ entries: {}, isLoaded: false });
			store.handleLogout(null);
		}

		if (typeof window !== 'undefined') {
			localStorage.setItem('mtg-snap-signed-in', 'true');
		}

		void store.hydrateFromSupabase(userId, triggerSync);
	}, [userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	// Bind mutations to current userId + triggerSync
	const addCard = useCallback(
		(card: ScryfallCard) => store.addCard(card, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const duplicateEntry = useCallback(
		(scryfallId: string, sourceEntry: CardEntry) =>
			store.duplicateEntry(scryfallId, sourceEntry, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const removeCard = useCallback(
		(scryfallId: string) => store.removeCard(scryfallId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const decrementCard = useCallback(
		(scryfallId: string) => store.decrementCard(scryfallId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const removeEntry = useCallback(
		(rowId: string) => store.removeEntry(rowId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const updateEntry = useCallback(
		(rowId: string, updates: Partial<CardEntry>) =>
			store.updateEntry(rowId, updates, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const changePrint = useCallback(
		(oldScryfallId: string, newScryfallId: string) =>
			store.changePrint(oldScryfallId, newScryfallId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const clearCollection = useCallback(
		() => store.clearCollection(userId, triggerSync),
		[store, userId, triggerSync]
	);
	const importCards = useCallback(
		(cards: Array<{ scryfallId: string; entry: CardEntry }>) =>
			store.importCards(cards, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const getQuantity = useCallback((scryfallId: string) => store.getQuantity(scryfallId), [store]);

	const entries = useMemo(() => Object.values(store.entries), [store.entries]);

	const value: CollectionContextValue = {
		collection: store.entries,
		entries,
		isLoaded: store.isLoaded,
		addCard,
		duplicateEntry,
		removeCard,
		decrementCard,
		removeEntry,
		updateEntry,
		changePrint,
		clearCollection,
		importCards,
		getQuantity,
	};

	return <CollectionContext value={value}>{children}</CollectionContext>;
}

export function useCollectionContext(): CollectionContextValue {
	const ctx = useContext(CollectionContext);
	if (!ctx) throw new Error('useCollectionContext must be used within a CollectionProvider');
	return ctx;
}
