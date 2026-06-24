'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useCollectionStore } from '../store/collection-store';
import type { CollectionData } from '../db/collection-migrations';

// Owned-copy counts for a single print (scryfall_id), split by finish.
export type CardOwnership = { total: number; foil: number; nonFoil: number };

const EMPTY_OWNERSHIP: CardOwnership = { total: 0, foil: 0, nonFoil: 0 };

// Bound collection API — userId and triggerSync are already captured
type CollectionContextValue = {
	collection: CollectionData;
	entries: Array<{ scryfallId: string; entry: CardEntry }>;
	isLoaded: boolean;
	isFullyLoaded: boolean;
	addCard: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;
	addCards: (card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) => void;
	duplicateEntry: (scryfallId: string, sourceEntry: CardEntry) => void;
	removeCard: (scryfallId: string) => void;
	decrementCard: (scryfallId: string) => void;
	removeEntry: (rowId: string) => void;
	updateEntry: (rowId: string, updates: Partial<CardEntry>) => void;
	changePrint: (rowId: string, newScryfallId: string, entryPatch?: Partial<CardEntry>) => void;
	clearCollection: () => void;
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;
	assignToDeck: (rowId: string, deckId: string) => void;
	unassignFromDeck: (rowId: string) => void;
	getQuantity: (scryfallId: string) => number;
	getOwnership: (scryfallId: string) => CardOwnership;
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
			useCollectionStore.setState({ entries: {}, isLoaded: false, isFullyLoaded: false });
			store.handleLogout(null);
		}

		if (typeof window !== 'undefined') {
			localStorage.setItem('wizcard-signed-in', 'true');
		}

		void store.hydrateFromSupabase(userId, triggerSync);
	}, [userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	// Bind mutations to current userId + triggerSync
	const addCard = useCallback(
		(card: ScryfallCard, entryPatch?: Partial<CardEntry>) =>
			store.addCard(card, userId, triggerSync, entryPatch),
		[store, userId, triggerSync]
	);
	const addCards = useCallback(
		(card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) =>
			store.addCards(card, count, userId, triggerSync, entryPatch),
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
		(rowId: string, newScryfallId: string, entryPatch?: Partial<CardEntry>) =>
			store.changePrint(rowId, newScryfallId, userId, triggerSync, entryPatch),
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
	const assignToDeck = useCallback(
		(rowId: string, deckId: string) => store.assignToDeck(rowId, deckId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const unassignFromDeck = useCallback(
		(rowId: string) => store.unassignFromDeck(rowId, userId, triggerSync),
		[store, userId, triggerSync]
	);
	const getQuantity = useCallback((scryfallId: string) => store.getQuantity(scryfallId), [store]);

	const entries = useMemo(() => Object.values(store.entries), [store.entries]);

	// O(1) ownership lookup by print (scryfall_id), split by finish, for set-completion views.
	const ownershipByScryfallId = useMemo(() => {
		const map = new Map<string, CardOwnership>();
		for (const { scryfallId, entry } of entries) {
			const cur = map.get(scryfallId) ?? { total: 0, foil: 0, nonFoil: 0 };
			cur.total += 1;
			if (entry.isFoil) cur.foil += 1;
			else cur.nonFoil += 1;
			map.set(scryfallId, cur);
		}
		return map;
	}, [entries]);

	const getOwnership = useCallback(
		(scryfallId: string) => ownershipByScryfallId.get(scryfallId) ?? EMPTY_OWNERSHIP,
		[ownershipByScryfallId]
	);

	const value: CollectionContextValue = {
		collection: store.entries,
		entries,
		isLoaded: store.isLoaded,
		isFullyLoaded: store.isFullyLoaded,
		addCard,
		addCards,
		duplicateEntry,
		removeCard,
		decrementCard,
		removeEntry,
		updateEntry,
		changePrint,
		clearCollection,
		importCards,
		assignToDeck,
		unassignFromDeck,
		getQuantity,
		getOwnership,
	};

	return <CollectionContext value={value}>{children}</CollectionContext>;
}

export function useCollectionContext(): CollectionContextValue {
	const ctx = useContext(CollectionContext);
	if (!ctx) throw new Error('useCollectionContext must be used within a CollectionProvider');
	return ctx;
}
