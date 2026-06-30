'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { type DeckZone, setDeckZone } from '@/types/decks';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useWishlistStore } from '../store/wishlist-store';
import type { WishlistData } from '../store/wishlist-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { useDeckStore, getLoadedDeckCard, patchLoadedDeckCard } from '@/lib/deck/store/deck-store';
import { enqueue } from '@/lib/supabase/sync-queue';

type WishlistContextValue = {
	wishlist: WishlistData;
	entries: Array<{ scryfallId: string; entry: CardEntry }>;
	isLoaded: boolean;
	addToWishlist: (card: ScryfallCard, entryPatch?: Partial<CardEntry>, count?: number) => void;
	duplicateEntry: (scryfallId: string, sourceEntry: CardEntry) => void;
	removeFromWishlist: (rowId: string) => void;
	clearWishlist: () => void;
	moveToCollection: (rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => void;
	moveToWishlist: (rowIds: string[]) => void;
	/**
	 * Assign wishlisted rows to a deck in place (sets deck_id + zone on the same
	 * rowId). The cards stay wishlisted (owner_id stays NULL) — they become
	 * "wanted for this deck", not owned copies.
	 */
	assignToDeck: (rowIds: string[], deckId: string, zone: DeckZone) => void;
	changePrint: (rowId: string, newScryfallId: string) => void;
};

// Sync-queue op type used to patch a shared `cards` row (deck card) in place —
// it matches on id only, so it works even when owner_id is NULL.
const DECK_CARD_UPDATE = 'deck-card-update' as const;

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const userId = user?.id ?? null;

	const store = useWishlistStore();
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
		(card: ScryfallCard, entryPatch?: Partial<CardEntry>, count?: number) =>
			store.addToWishlist(card, userId, triggerSync, entryPatch, count),
		[store, userId, triggerSync]
	);

	const duplicateEntry = useCallback(
		(scryfallId: string, sourceEntry: CardEntry) => {
			// Copy the source entry's metadata but not its rowId or date:
			// addToWishlist generates a new rowId and dateAdded for the copy.
			// Also drop deckId and ownerId: the copy is a brand-new pure wishlist
			// entry and must not inherit deck membership nor the source's owner
			// (owner_id is forced to userId on insert).
			const patch: Partial<CardEntry> = { ...sourceEntry };
			delete patch.rowId;
			delete patch.dateAdded;
			delete patch.deckId;
			delete patch.ownerId;
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
			const loadedDeckCard = getLoadedDeckCard(rowId);
			const isDeckCard = copy?.entry.deckId != null || loadedDeckCard != null;

			if (isDeckCard) {
				// Drop it from the wishlist view.
				store.removeFromWishlist(rowId, null, triggerSync);
				// Clear the wishlist flag on the deck-store copy if the deck is loaded.
				patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, wishlist: undefined } }));
				// Persist wishlist=false on the shared row.
				if (userId) {
					enqueue({ type: DECK_CARD_UPDATE, payload: { rowId, updates: { wishlist: false } } });
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
		(rowIds: string[], scryfallId: string, entryPatch: Partial<CardEntry>) => {
			const wishlistEntries = useWishlistStore.getState().entries;
			const colEntries = useCollectionStore.getState().entries;
			const nextWishlist = { ...wishlistEntries };
			const nextCollection = { ...colEntries };

			for (const rowId of rowIds) {
				const copy = wishlistEntries[rowId];
				if (!copy) continue;
				// Flip in place: same rowId, wishlist=false, edition + metadata patched.
				const movedEntry: CardEntry = {
					...copy.entry,
					...entryPatch,
					rowId,
					wishlist: false,
				};
				delete nextWishlist[rowId];
				nextCollection[rowId] = { scryfallId, entry: movedEntry };

				const isDeckCard = copy.entry.deckId != null || getLoadedDeckCard(rowId) != null;

				if (isDeckCard) {
					// Deck cards have owner_id=NULL in the DB, so plain `update` would
					// match 0 rows. Use deck-card-update (matches on id only) and also
					// set owner_id so the row appears on the collection page.
					if (userId) {
						enqueue({
							type: DECK_CARD_UPDATE,
							payload: {
								rowId,
								updates: { wishlist: false, owner_id: userId, scryfall_id: scryfallId },
							},
						});
					}
					// Mirror the move in the deck store so its in-memory copy is consistent.
					patchLoadedDeckCard(rowId, (c) => ({
						...c,
						scryfallId,
						entry: { ...c.entry, wishlist: undefined },
					}));
				} else {
					// Pure wishlist card: owner_id is already set, plain update works.
					if (userId) {
						enqueue({
							type: 'update',
							payload: { userId, rowId, entry: movedEntry, scryfallId },
						});
					}
				}
			}

			useWishlistStore.setState({ entries: nextWishlist });
			useCollectionStore.setState({ entries: nextCollection });
			if (userId) triggerSync();
		},
		[userId, triggerSync]
	);

	// Symmetric to moveToCollection: flip owned collection copies into wishlist
	// entries in place (same rowId, no duplicate row), so a given entity is never
	// in both views at once.
	const moveToWishlist = useCallback(
		(rowIds: string[]) => {
			const colEntries = useCollectionStore.getState().entries;
			const wishlistEntries = useWishlistStore.getState().entries;
			const nextCollection = { ...colEntries };
			const nextWishlist = { ...wishlistEntries };

			for (const rowId of rowIds) {
				const copy = colEntries[rowId];
				if (!copy) continue;
				const movedEntry: CardEntry = { ...copy.entry, rowId, wishlist: true };
				delete nextCollection[rowId];
				nextWishlist[rowId] = { scryfallId: copy.scryfallId, entry: movedEntry };

				const isDeckCard = copy.entry.deckId != null || getLoadedDeckCard(rowId) != null;

				if (isDeckCard) {
					// Deck card owned copy → wishlisted deck card: clear owner_id and set
					// wishlist. Use deck-card-update (matches on id only).
					if (userId) {
						enqueue({
							type: DECK_CARD_UPDATE,
							payload: { rowId, updates: { wishlist: true, owner_id: null } },
						});
					}
					patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, wishlist: true } }));
				} else {
					// Pure collection card: keep owner_id, flip wishlist=true so it leaves
					// the collection view (wishlist=false) and enters the wishlist view.
					if (userId) {
						enqueue({
							type: 'update',
							payload: { userId, rowId, entry: movedEntry, scryfallId: copy.scryfallId },
						});
					}
				}
			}

			useCollectionStore.setState({ entries: nextCollection });
			useWishlistStore.setState({ entries: nextWishlist });
			if (userId) triggerSync();
		},
		[userId, triggerSync]
	);

	// Assign wishlisted rows to a deck in place. A wishlist row has owner_id=NULL,
	// so addCollectionCardToDeck (which only looks in the collection store) can't
	// find it and silently no-ops — we patch the shared `cards` row directly via
	// deck-card-update instead, keeping wishlist=true.
	const assignToDeck = useCallback(
		(rowIds: string[], deckId: string, zone: DeckZone) => {
			const wishlistEntries = useWishlistStore.getState().entries;
			const nextWishlist = { ...wishlistEntries };
			const deckIsLoaded = useDeckStore.getState().decksCards[deckId] != null;
			const deckMirror: Record<string, { scryfallId: string; entry: CardEntry }> = {};

			for (const rowId of rowIds) {
				const copy = wishlistEntries[rowId];
				if (!copy) continue;
				const tags = setDeckZone(copy.entry.tags, zone);
				const updatedEntry: CardEntry = { ...copy.entry, deckId, tags };

				// Keep the row in the wishlist view (still wanted) but now linked to the
				// deck so it shows a deck badge.
				nextWishlist[rowId] = { scryfallId: copy.scryfallId, entry: updatedEntry };

				// Mirror into the deck store only if that deck is loaded.
				if (deckIsLoaded) {
					deckMirror[rowId] = { scryfallId: copy.scryfallId, entry: updatedEntry };
				}

				if (userId) {
					enqueue({
						type: DECK_CARD_UPDATE,
						payload: { rowId, updates: { deck_id: deckId, tags } },
					});
				}
			}

			useWishlistStore.setState({ entries: nextWishlist });
			if (deckIsLoaded && Object.keys(deckMirror).length > 0) {
				useDeckStore.setState((state) => ({
					decksCards: {
						...state.decksCards,
						[deckId]: { ...(state.decksCards[deckId] ?? {}), ...deckMirror },
					},
				}));
			}
			if (userId) triggerSync();
		},
		[userId, triggerSync]
	);

	const changePrint = useCallback(
		(rowId: string, newScryfallId: string) => {
			// A wishlisted deck card has no owner_id, so it must persist via the
			// deck-card update path (matches on id), not the owner-scoped one.
			const copy = store.entries[rowId];
			const loadedDeckCard = getLoadedDeckCard(rowId);
			const isDeckCard = copy?.entry.deckId != null || loadedDeckCard != null;
			store.changePrint(rowId, newScryfallId, userId, triggerSync, isDeckCard);

			// The `cards` row is shared: if this wishlist row is also a deck card or a
			// collection copy, keep their in-memory print in sync (the DB row was
			// already patched in place by the update op above).
			patchLoadedDeckCard(rowId, (c) => ({ ...c, scryfallId: newScryfallId }));
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
		moveToWishlist,
		assignToDeck,
		changePrint,
	};

	return <WishlistContext value={value}>{children}</WishlistContext>;
}

export function useWishlistContext(): WishlistContextValue {
	const ctx = useContext(WishlistContext);
	if (!ctx) throw new Error('useWishlistContext must be used within a WishlistProvider');
	return ctx;
}
