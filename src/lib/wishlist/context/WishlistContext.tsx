'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useWishlistStore } from '../store/wishlist-store';
import type { WishlistData } from '../store/wishlist-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';

type WishlistContextValue = {
	wishlist: WishlistData;
	entries: Array<{ scryfallId: string; entry: CardEntry }>;
	isLoaded: boolean;
	addToWishlist: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;
	removeFromWishlist: (rowId: string) => void;
	clearWishlist: () => void;
	moveToCollection: (rowId: string) => void;
	changePrint: (rowId: string, newScryfallId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const userId = user?.id ?? null;

	const store = useWishlistStore();
	const collectionStore = useCollectionStore();
	const prevUserIdRef = useRef<string | null | undefined>(undefined);

	useEffect(() => {
		if (authLoading) return;

		const prevUserId = prevUserIdRef.current;
		prevUserIdRef.current = userId;

		if (!userId) {
			store.handleLogout();
			return;
		}

		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			useWishlistStore.setState({ entries: {}, isLoaded: false });
			store.handleLogout();
		}

		void store.hydrateFromSupabase(userId);
	}, [userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	const addToWishlist = useCallback(
		(card: ScryfallCard, entryPatch?: Partial<CardEntry>) =>
			store.addToWishlist(card, userId, triggerSync, entryPatch),
		[store, userId, triggerSync]
	);

	const removeFromWishlist = useCallback(
		(rowId: string) => store.removeFromWishlist(rowId, userId, triggerSync),
		[store, userId, triggerSync]
	);

	const clearWishlist = useCallback(
		() => store.clearWishlist(userId, triggerSync),
		[store, userId, triggerSync]
	);

	const moveToCollection = useCallback(
		(rowId: string) => {
			const copy = store.entries[rowId];
			if (!copy) return;
			const stubCard = { id: copy.scryfallId } as Parameters<typeof collectionStore.addCard>[0];
			collectionStore.addCard(stubCard, userId, triggerSync, copy.entry);
			store.removeFromWishlist(rowId, userId, triggerSync);
		},
		[store, collectionStore, userId, triggerSync]
	);

	const changePrint = useCallback(
		(rowId: string, newScryfallId: string) =>
			store.changePrint(rowId, newScryfallId, userId, triggerSync),
		[store, userId, triggerSync]
	);

	const entries = Object.values(store.entries);

	const value: WishlistContextValue = {
		wishlist: store.entries,
		entries,
		isLoaded: store.isLoaded,
		addToWishlist,
		removeFromWishlist,
		clearWishlist,
		moveToCollection,
		changePrint,
	};

	return <WishlistContext value={value}>{children}</WishlistContext>;
}

export function useWishlistContext(): WishlistContextValue {
	const ctx = useContext(WishlistContext);
	if (!ctx) throw new Error('useWishlistContext must be used within a WishlistProvider');
	return ctx;
}
