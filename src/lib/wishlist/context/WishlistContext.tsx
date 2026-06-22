'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useWishlistStore } from '../store/wishlist-store';
import type { WishlistData } from '../store/wishlist-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { useDeckStore } from '@/lib/deck/store/deck-store';
import { enqueue } from '@/lib/supabase/sync-queue';

type WishlistContextValue = {
	wishlist: WishlistData;
	entries: Array<{ scryfallId: string; entry: CardEntry }>;
	isLoaded: boolean;
	addToWishlist: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;
	duplicateEntry: (scryfallId: string, sourceEntry: CardEntry) => void;
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

	const duplicateEntry = useCallback(
		(scryfallId: string, sourceEntry: CardEntry) => {
			// On copie les métadonnées de l'entry source mais pas son rowId ni sa date :
			// addToWishlist génère un nouveau rowId et une nouvelle dateAdded pour la copie.
			const patch: Partial<CardEntry> = { ...sourceEntry };
			delete patch.rowId;
			delete patch.dateAdded;
			const stubCard = { id: scryfallId } as ScryfallCard;
			store.addToWishlist(stubCard, userId, triggerSync, patch);
		},
		[store, userId, triggerSync]
	);

	const removeFromWishlist = useCallback(
		(rowId: string) => {
			// If this wishlist row is also a deck card (shared `cards` row), removing
			// it from the wishlist must NOT delete the row — only clear its wishlist
			// flag, so the deck card survives. Pure wishlist rows are deleted.
			const copy = store.entries[rowId];
			const deckCards = useDeckStore.getState().activeDeckCards;
			const isDeckCard = copy?.entry.deckId != null || deckCards[rowId] != null;

			if (isDeckCard) {
				// Drop it from the wishlist view.
				store.removeFromWishlist(rowId, null, triggerSync);
				// Clear the wishlist flag on the deck-store copy if the deck is loaded.
				const deckCopy = deckCards[rowId];
				if (deckCopy) {
					useDeckStore.setState({
						activeDeckCards: {
							...deckCards,
							[rowId]: { ...deckCopy, entry: { ...deckCopy.entry, wishlist: undefined } },
						},
					});
				}
				// Persist wishlist=false on the shared row.
				if (userId) {
					enqueue({ type: 'deck-card-update', payload: { rowId, updates: { wishlist: false } } });
					triggerSync();
				}
				return;
			}
			store.removeFromWishlist(rowId, userId, triggerSync);
		},
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
		(rowId: string, newScryfallId: string) => {
			store.changePrint(rowId, newScryfallId, userId, triggerSync);

			// The `cards` row is shared: if this wishlist row is also a deck card or a
			// collection copy, keep their in-memory print in sync (the DB row was
			// already patched in place by the wishlist update op above).
			const deckCards = useDeckStore.getState().activeDeckCards;
			const deckCopy = deckCards[rowId];
			if (deckCopy) {
				useDeckStore.setState({
					activeDeckCards: {
						...deckCards,
						[rowId]: { ...deckCopy, scryfallId: newScryfallId },
					},
				});
			}
			const colEntries = useCollectionStore.getState().entries;
			const colCopy = colEntries[rowId];
			if (colCopy) {
				useCollectionStore.setState({
					entries: { ...colEntries, [rowId]: { ...colCopy, scryfallId: newScryfallId } },
				});
			}
		},
		[store, userId, triggerSync]
	);

	const entries = Object.values(store.entries);

	const value: WishlistContextValue = {
		wishlist: store.entries,
		entries,
		isLoaded: store.isLoaded,
		addToWishlist,
		duplicateEntry,
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
