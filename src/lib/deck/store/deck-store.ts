'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { DeckMeta, DeckZone, FolderMeta } from '@/types/decks';
import { setDeckZone } from '@/types/decks';
import { fetchDecks, fetchDeckCards } from '../db/decks';
import { fetchFolders } from '../db/folders';
import { enqueue } from '@/lib/supabase/sync-queue';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { useWishlistStore } from '@/lib/wishlist/store/wishlist-store';
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';

const SYNC_DECK_CARD_INSERT = 'deck-card-insert' as const;
const SYNC_DECK_CARD_UPDATE = 'deck-card-update' as const;
const SYNC_DECK_CARD_DELETE = 'deck-card-delete' as const;

type StoredCopy = { scryfallId: string; entry: CardEntry };

type DeckState = {
	decks: Record<string, DeckMeta>;
	folders: Record<string, FolderMeta>;
	/** The most recently loaded deck (kept for "currently viewed" semantics). */
	activeDeckId: string | null;
	/** Loaded deck cards, keyed by deckId then rowId. Multiple decks can be loaded
	 * at once (e.g. a card modal recontextualising a card from another deck). */
	decksCards: Record<string, Record<string, StoredCopy>>;
	isLoaded: boolean;
};

/** Locate a loaded deck card by rowId across all loaded decks. */
function findDeckOfRow(
	decksCards: Record<string, Record<string, StoredCopy>>,
	rowId: string
): { deckId: string; copy: StoredCopy } | null {
	for (const [deckId, cards] of Object.entries(decksCards)) {
		const copy = cards[rowId];
		if (copy) return { deckId, copy };
	}
	return null;
}

/**
 * Cross-store helper: find a loaded deck card by rowId, regardless of which deck
 * it belongs to. Used by WishlistContext to mirror shared-`cards`-row changes
 * into the deck store without knowing the deckId up front.
 */
export function getLoadedDeckCard(rowId: string): { deckId: string; copy: StoredCopy } | null {
	return findDeckOfRow(useDeckStore.getState().decksCards, rowId);
}

/**
 * Cross-store helper: apply an in-memory patch to a loaded deck card (by rowId),
 * or remove it (updater returns null). No-op if the row is not loaded in any
 * deck. Keeps the deck store consistent after wishlist/collection moves.
 */
export function patchLoadedDeckCard(
	rowId: string,
	updater: (copy: StoredCopy) => StoredCopy | null
): void {
	const found = findDeckOfRow(useDeckStore.getState().decksCards, rowId);
	if (!found) return;
	const { deckId, copy } = found;
	const next = updater(copy);
	useDeckStore.setState((state) => {
		const deckCards = { ...(state.decksCards[deckId] ?? {}) };
		if (next === null) delete deckCards[rowId];
		else deckCards[rowId] = next;
		return { decksCards: { ...state.decksCards, [deckId]: deckCards } };
	});
}

type DeckActions = {
	hydrateDecks: (userId: string) => Promise<void>;
	hydrateActiveDeck: (deckId: string) => Promise<void>;
	handleLogout: () => void;

	createFolder: (
		name: string,
		parentId: string | null,
		userId: string,
		triggerSync: () => void
	) => string;
	updateFolder: (
		folderId: string,
		updates: Partial<Pick<FolderMeta, 'name' | 'parentId' | 'position'>>,
		userId: string,
		triggerSync: () => void
	) => void;
	deleteFolder: (folderId: string, userId: string, triggerSync: () => void) => void;
	moveFolderToFolder: (
		folderId: string,
		newParentId: string | null,
		userId: string,
		triggerSync: () => void
	) => void;
	moveDeckToFolder: (
		deckId: string,
		folderId: string | null,
		userId: string,
		triggerSync: () => void
	) => void;

	createDeck: (
		name: string,
		format: DeckMeta['format'],
		description: string | null,
		folderId: string | null,
		userId: string,
		triggerSync: () => void
	) => string;
	updateDeck: (
		deckId: string,
		updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl'>>,
		userId: string,
		triggerSync: () => void
	) => void;
	deleteDeck: (
		deckId: string,
		userId: string,
		triggerSync: () => void,
		options?: { deleteCollectionCopies?: boolean }
	) => void;

	addCardToDeck: (
		deckId: string,
		card: ScryfallCard,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;
	addCollectionCardToDeck: (
		deckId: string,
		collectionRowId: string,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;
	bulkAddCardsToDeck: (
		deckId: string,
		cards: Array<{
			card: ScryfallCard;
			zone: DeckZone;
			quantity: number;
			entry?: Partial<CardEntry>;
		}>,
		userId: string,
		triggerSync: () => void
	) => void;
	removeCardFromDeck: (rowId: string, triggerSync: () => void, mode?: 'delete' | 'detach') => void;
	changeZone: (rowId: string, zone: DeckZone, triggerSync: () => void) => void;
	updateDeckCard: (rowId: string, updates: Partial<CardEntry>, triggerSync: () => void) => void;
	toggleOwned: (
		rowId: string,
		userId: string,
		proxy: boolean | undefined,
		triggerSync: () => void
	) => void;
	toggleDeckCardWishlist: (rowId: string, triggerSync: () => void) => void;
	changeDeckCardPrint: (
		rowId: string,
		newCard: ScryfallCard,
		deckId: string,
		triggerSync: () => void
	) => void;

	replaceDeckCardWithCollectionCopy: (
		deckCardRowId: string,
		collectionRowId: string,
		deckId: string,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;

	unassignCollectionCopyFromDeckCard: (
		deckCardRowId: string,
		deckId: string,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;

	getDeckCardCount: (deckId: string) => number;
};

export const useDeckStore = create<DeckState & DeckActions>()((set, get) => ({
	decks: {},
	folders: {},
	activeDeckId: null,
	decksCards: {},
	isLoaded: false,

	hydrateDecks: async (userId) => {
		const [deckList, folderList] = await Promise.all([fetchDecks(userId), fetchFolders(userId)]);
		const decks: Record<string, DeckMeta> = {};
		for (const deck of deckList) decks[deck.id] = deck;
		const folders: Record<string, FolderMeta> = {};
		for (const folder of folderList) folders[folder.id] = folder;
		set({ decks, folders, isLoaded: true });
	},

	hydrateActiveDeck: async (deckId) => {
		const rows = await fetchDeckCards(deckId);
		const cards: Record<string, StoredCopy> = {};
		for (const row of rows) cards[row.entry.rowId] = row;
		set((state) => ({
			activeDeckId: deckId,
			decksCards: { ...state.decksCards, [deckId]: cards },
		}));
	},

	handleLogout: () => {
		set({ decks: {}, folders: {}, activeDeckId: null, decksCards: {}, isLoaded: false });
	},

	createFolder: (name, parentId, userId, triggerSync) => {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		// Assign position as siblings count + 1
		const siblingsCount = Object.values(get().folders).filter(
			(f) => f.parentId === parentId
		).length;
		const folder: FolderMeta = {
			id,
			parentId,
			name,
			position: siblingsCount,
			createdAt: now,
			updatedAt: now,
		};
		set((state) => ({ folders: { ...state.folders, [id]: folder } }));
		enqueue({ type: 'folder-insert', payload: { userId, folder } });
		triggerSync();
		return id;
	},

	updateFolder: (folderId, updates, userId, triggerSync) => {
		const current = get().folders[folderId];
		if (!current) return;
		const updated: FolderMeta = { ...current, ...updates, updatedAt: new Date().toISOString() };
		set((state) => ({ folders: { ...state.folders, [folderId]: updated } }));
		enqueue({ type: 'folder-update', payload: { userId, folderId, updates } });
		triggerSync();
	},

	deleteFolder: (folderId, userId, triggerSync) => {
		const nextFolders = { ...get().folders };
		// Collect all descendant folder IDs to cascade-nullify deck folderId client-side
		const toDelete = new Set<string>();
		const collect = (id: string) => {
			toDelete.add(id);
			for (const f of Object.values(nextFolders)) {
				if (f.parentId === id) collect(f.id);
			}
		};
		collect(folderId);
		for (const id of toDelete) delete nextFolders[id];
		// Nullify folderId on decks that belonged to any deleted folder
		const nextDecks = { ...get().decks };
		for (const [deckId, deck] of Object.entries(nextDecks)) {
			if (deck.folderId !== null && toDelete.has(deck.folderId)) {
				nextDecks[deckId] = { ...deck, folderId: null };
			}
		}
		set({ folders: nextFolders, decks: nextDecks });
		enqueue({ type: 'folder-delete', payload: { userId, folderId } });
		triggerSync();
	},

	moveFolderToFolder: (folderId, newParentId, userId, triggerSync) => {
		const folders = get().folders;
		const folder = folders[folderId];
		if (!folder) return;
		// Prevent moving a folder into itself or one of its descendants
		const isDescendant = (targetId: string | null): boolean => {
			if (targetId === null) return false;
			if (targetId === folderId) return true;
			const t = folders[targetId];
			return t ? isDescendant(t.parentId) : false;
		};
		if (isDescendant(newParentId)) return;
		if (folder.parentId === newParentId) return;
		const updated: FolderMeta = {
			...folder,
			parentId: newParentId,
			updatedAt: new Date().toISOString(),
		};
		set((state) => ({ folders: { ...state.folders, [folderId]: updated } }));
		enqueue({
			type: 'folder-update',
			payload: { userId, folderId, updates: { parentId: newParentId } },
		});
		triggerSync();
	},

	moveDeckToFolder: (deckId, folderId, userId, triggerSync) => {
		const deck = get().decks[deckId];
		if (!deck) return;
		set((state) => ({
			decks: {
				...state.decks,
				[deckId]: { ...deck, folderId, updatedAt: new Date().toISOString() },
			},
		}));
		enqueue({ type: 'deck-move', payload: { userId, deckId, folderId } });
		triggerSync();
	},

	createDeck: (name, format, description, folderId, userId, triggerSync) => {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const deck: DeckMeta = {
			id,
			ownerId: userId,
			name,
			format,
			description,
			folderId: folderId ?? null,
			coverArtUrl: null,
			createdAt: now,
			updatedAt: now,
		};
		set((state) => ({ decks: { ...state.decks, [id]: deck } }));
		getAnalytics().track({ name: 'deck_created', props: { deckId: id } });
		enqueue({ type: 'deck-insert', payload: { userId, deck } });
		triggerSync();
		return id;
	},

	updateDeck: (deckId, updates, userId, triggerSync) => {
		const current = get().decks[deckId];
		if (!current) return;
		const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
		set((state) => ({ decks: { ...state.decks, [deckId]: updated } }));
		enqueue({ type: 'deck-update', payload: { userId, deckId, updates } });
		triggerSync();
	},

	deleteDeck: (deckId, userId, triggerSync, options) => {
		const next = { ...get().decks };
		delete next[deckId];
		const nextDecksCards = { ...get().decksCards };
		delete nextDecksCards[deckId];
		const stateUpdate: Partial<DeckState> = { decks: next, decksCards: nextDecksCards };
		if (get().activeDeckId === deckId) {
			stateUpdate.activeDeckId = null;
		}
		set(stateUpdate);
		getAnalytics().track({ name: 'deck_deleted', props: { deckId } });

		// Sync collection store client-side: remove deckId from freed copies
		if (!options?.deleteCollectionCopies) {
			const colEntries = useCollectionStore.getState().entries;
			const updatedEntries = { ...colEntries };
			let changed = false;
			for (const [rowId, copy] of Object.entries(updatedEntries)) {
				if (copy.entry.deckId === deckId) {
					const rest = Object.fromEntries(
						Object.entries(copy.entry).filter(([k]) => k !== 'deckId')
					) as typeof copy.entry;
					updatedEntries[rowId] = { ...copy, entry: rest };
					changed = true;
				}
			}
			if (changed) useCollectionStore.setState({ entries: updatedEntries });
		}

		enqueue({
			type: 'deck-delete',
			payload: { userId, deckId, deleteCollectionCopies: options?.deleteCollectionCopies ?? false },
		});
		triggerSync();
	},

	addCardToDeck: (deckId, card, zone, userId, triggerSync) => {
		const rowId = crypto.randomUUID();
		const entry: CardEntry = {
			rowId,
			dateAdded: new Date().toISOString(),
			deckId,
			tags: setDeckZone(undefined, zone),
		};
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[deckId]: { ...(state.decksCards[deckId] ?? {}), [rowId]: { scryfallId: card.id, entry } },
			},
		}));
		enqueue({
			type: SYNC_DECK_CARD_INSERT,
			payload: { deckId, scryfallId: card.id, entry },
		});
		getAnalytics().track({
			name: 'card_added_to_deck',
			props: { deckId, scryfallId: card.id },
		});
		triggerSync();

		// Update deck's updatedAt
		const deck = get().decks[deckId];
		if (deck) {
			set((state) => ({
				decks: {
					...state.decks,
					[deckId]: { ...deck, updatedAt: new Date().toISOString() },
				},
			}));
		}
	},

	addCollectionCardToDeck: (deckId, collectionRowId, zone, userId, triggerSync) => {
		const ce = useCollectionStore.getState().entries[collectionRowId];
		const collectionCopy = ce ? { scryfallId: ce.scryfallId, entry: ce.entry } : null;

		if (!collectionCopy) return;

		const newTags = setDeckZone(collectionCopy.entry.tags, zone);
		const updatedEntry: CardEntry = {
			...collectionCopy.entry,
			deckId,
			tags: newTags,
			ownerId: userId,
		};

		// Add to deck store using the collection rowId (not a new UUID)
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[deckId]: {
					...(state.decksCards[deckId] ?? {}),
					[collectionRowId]: { scryfallId: collectionCopy.scryfallId, entry: updatedEntry },
				},
			},
			...(state.decks[deckId]
				? {
						decks: {
							...state.decks,
							[deckId]: { ...state.decks[deckId], updatedAt: new Date().toISOString() },
						},
					}
				: {}),
		}));

		// Update collection store so the copy no longer appears as free
		const colEntries = useCollectionStore.getState().entries;
		if (colEntries[collectionRowId]) {
			useCollectionStore.setState({
				entries: {
					...colEntries,
					[collectionRowId]: { scryfallId: collectionCopy.scryfallId, entry: updatedEntry },
				},
			});
		}

		// One update op — the collection row serves as the deck card row
		enqueue({ type: 'update', payload: { userId, rowId: collectionRowId, entry: updatedEntry } });
		triggerSync();
	},

	bulkAddCardsToDeck: (deckId, cards, userId, triggerSync) => {
		const now = new Date().toISOString();
		const newCards: Record<string, StoredCopy> = {};
		const syncPayload: Array<{ scryfallId: string; entry: CardEntry }> = [];

		for (const { card, zone, quantity, entry: extra } of cards) {
			for (let i = 0; i < quantity; i++) {
				const rowId = crypto.randomUUID();
				const entry: CardEntry = {
					...extra,
					rowId,
					dateAdded: now,
					deckId,
					tags: setDeckZone(extra?.tags, zone),
				};
				newCards[rowId] = { scryfallId: card.id, entry };
				syncPayload.push({ scryfallId: card.id, entry });
			}
		}

		set((state) => ({
			activeDeckId: deckId,
			decksCards: {
				...state.decksCards,
				[deckId]: { ...(state.decksCards[deckId] ?? {}), ...newCards },
			},
			decks: {
				...state.decks,
				...(state.decks[deckId] ? { [deckId]: { ...state.decks[deckId], updatedAt: now } } : {}),
			},
		}));

		enqueue({
			type: 'deck-card-bulk-insert',
			payload: { deckId, cards: syncPayload },
		});
		triggerSync();
	},

	removeCardFromDeck: (rowId, triggerSync, mode = 'delete') => {
		const found = findDeckOfRow(get().decksCards, rowId);
		if (!found) return;
		const { deckId: foundDeckId, copy } = found;
		const next = { ...get().decksCards[foundDeckId] };
		delete next[rowId];
		set((state) => ({ decksCards: { ...state.decksCards, [foundDeckId]: next } }));

		// Detach: keep the shared `cards` row but free it from the deck (deck_id =
		// null). The row stays in the collection/wishlist store under the same rowId
		// with its deckId cleared, so the card remains owned/wishlisted.
		if (mode === 'detach') {
			const freedEntry: CardEntry = { ...copy.entry, deckId: undefined };

			const colEntries = useCollectionStore.getState().entries;
			if (colEntries[rowId]) {
				useCollectionStore.setState({
					entries: { ...colEntries, [rowId]: { scryfallId: copy.scryfallId, entry: freedEntry } },
				});
			}
			const wishEntries = useWishlistStore.getState().entries;
			if (wishEntries[rowId]) {
				useWishlistStore.setState({
					entries: { ...wishEntries, [rowId]: { scryfallId: copy.scryfallId, entry: freedEntry } },
				});
			}

			if (copy.entry.ownerId) {
				// Owned copy: owner-scoped update writes deck_id = null.
				enqueue({
					type: 'update',
					payload: { userId: copy.entry.ownerId, rowId, entry: freedEntry },
				});
			} else {
				// Wishlist copy has no owner_id, so use the id-filtered deck-card update.
				enqueue({ type: SYNC_DECK_CARD_UPDATE, payload: { rowId, updates: { deck_id: null } } });
			}
			triggerSync();
			return;
		}

		// Delete: remove the row entirely (and from the collection/wishlist stores).
		const colEntries = useCollectionStore.getState().entries;
		if (colEntries[rowId]) {
			const remainingEntries = Object.fromEntries(
				Object.entries(colEntries).filter(([k]) => k !== rowId)
			) as typeof colEntries;
			useCollectionStore.setState({ entries: remainingEntries });
		}
		const wishEntries = useWishlistStore.getState().entries;
		if (wishEntries[rowId]) {
			const remaining = { ...wishEntries };
			delete remaining[rowId];
			useWishlistStore.setState({ entries: remaining });
		}

		enqueue({ type: SYNC_DECK_CARD_DELETE, payload: { rowId } });
		triggerSync();
	},

	changeZone: (rowId, zone, triggerSync) => {
		const found = findDeckOfRow(get().decksCards, rowId);
		if (!found) return;
		const { deckId: foundDeckId, copy } = found;
		const newTags = setDeckZone(copy.entry.tags, zone);
		const updatedEntry: CardEntry = { ...copy.entry, tags: newTags };
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[foundDeckId]: {
					...state.decksCards[foundDeckId],
					[rowId]: { ...copy, entry: updatedEntry },
				},
			},
		}));
		enqueue({ type: SYNC_DECK_CARD_UPDATE, payload: { rowId, updates: { tags: newTags } } });
		triggerSync();
	},

	updateDeckCard: (rowId, updates, triggerSync) => {
		const found = findDeckOfRow(get().decksCards, rowId);
		if (!found) return;
		const { deckId: foundDeckId, copy } = found;
		const updatedEntry: CardEntry = { ...copy.entry, ...updates };
		// Preserve zone tags when caller doesn't supply tags
		if (!updates.tags) updatedEntry.tags = copy.entry.tags;
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[foundDeckId]: {
					...state.decksCards[foundDeckId],
					[rowId]: { ...copy, entry: updatedEntry },
				},
			},
		}));
		// Translate Partial<CardEntry> to DB column names
		const dbUpdates: {
			tags?: string[];
			is_foil?: boolean | null;
			foil_type?: string | null;
			condition?: string | null;
			language?: string | null;
			purchase_price?: string | null;
		} = {};
		if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
		if (updates.isFoil !== undefined) dbUpdates.is_foil = updates.isFoil ?? null;
		if (updates.foilType !== undefined) dbUpdates.foil_type = updates.foilType ?? null;
		if (updates.condition !== undefined) dbUpdates.condition = updates.condition ?? null;
		if (updates.language !== undefined) dbUpdates.language = updates.language ?? null;
		if (updates.purchasePrice !== undefined)
			dbUpdates.purchase_price = updates.purchasePrice ?? null;
		enqueue({ type: SYNC_DECK_CARD_UPDATE, payload: { rowId, updates: dbUpdates } });
		triggerSync();
	},

	toggleOwned: (rowId, userId, proxy, triggerSync) => {
		const found = findDeckOfRow(get().decksCards, rowId);
		if (!found) return;
		const { deckId: foundDeckId, copy } = found;
		const isCurrentlyOwned = !!copy.entry.ownerId;
		const newOwnerId = isCurrentlyOwned ? null : userId;
		const claiming = newOwnerId != null;
		const updates: {
			owner_id: string | null;
			proxy?: boolean | null;
			wishlist?: boolean;
		} = { owner_id: newOwnerId };
		if (proxy !== undefined) updates.proxy = proxy;
		// Invariant: a single entity (same rowId) is never in both wishlist and
		// collection. Claiming ownership clears the wishlist flag in place. Un-owning
		// must NOT re-wishlist, so only touch wishlist on the claim branch.
		if (claiming) updates.wishlist = false;
		const newEntry = {
			...copy.entry,
			ownerId: newOwnerId ?? undefined,
			...(claiming ? { wishlist: undefined } : {}),
			...(proxy !== undefined ? { proxy } : {}),
		};
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[foundDeckId]: { ...state.decksCards[foundDeckId], [rowId]: { ...copy, entry: newEntry } },
			},
		}));

		// Keep collection store in sync. A card is "in the collection" iff it has
		// an ownerId, so owning a deck card inserts it into the collection store
		// (under the same rowId, mirroring the DB's single `cards` table) and
		// un-owning removes it.
		const colEntries = useCollectionStore.getState().entries;
		if (newOwnerId) {
			useCollectionStore.setState({
				entries: { ...colEntries, [rowId]: { scryfallId: copy.scryfallId, entry: newEntry } },
			});
			// Enforce the wishlist/collection invariant in memory too: if this same
			// rowId was wishlisted, drop it from the wishlist view.
			const wishEntries = useWishlistStore.getState().entries;
			if (wishEntries[rowId]) {
				const rest = { ...wishEntries };
				delete rest[rowId];
				useWishlistStore.setState({ entries: rest });
			}
		} else if (colEntries[rowId]) {
			const rest = { ...colEntries };
			delete rest[rowId];
			useCollectionStore.setState({ entries: rest });
		}
		enqueue({ type: SYNC_DECK_CARD_UPDATE, payload: { rowId, updates } });
		triggerSync();
	},

	toggleDeckCardWishlist: (rowId, triggerSync) => {
		const found = findDeckOfRow(get().decksCards, rowId);
		if (!found) return;
		const { deckId: foundDeckId, copy } = found;
		const nextWishlist = !copy.entry.wishlist;
		const newEntry: CardEntry = { ...copy.entry, wishlist: nextWishlist || undefined };
		set((state) => ({
			decksCards: {
				...state.decksCards,
				[foundDeckId]: { ...state.decksCards[foundDeckId], [rowId]: { ...copy, entry: newEntry } },
			},
		}));

		// Mirror into the wishlist store under the same rowId (single shared `cards`
		// row): wishlisting a deck card makes it appear on the wishlist page, and
		// un-wishlisting removes it there. The deck card itself is preserved.
		const wishEntries = useWishlistStore.getState().entries;
		if (nextWishlist) {
			useWishlistStore.setState({
				entries: { ...wishEntries, [rowId]: { scryfallId: copy.scryfallId, entry: newEntry } },
			});
		} else if (wishEntries[rowId]) {
			const rest = { ...wishEntries };
			delete rest[rowId];
			useWishlistStore.setState({ entries: rest });
		}

		enqueue({
			type: SYNC_DECK_CARD_UPDATE,
			payload: { rowId, updates: { wishlist: nextWishlist } },
		});
		triggerSync();
	},

	changeDeckCardPrint: (rowId, newCard, deckId, triggerSync) => {
		const current = get().decksCards[deckId] ?? {};
		const copy = current[rowId];
		if (!copy) return;

		// Owned or wishlisted deck cards are real shared `cards` rows: changing the
		// print must modify that same physical row in place (keep rowId, just swap
		// the print) rather than spawning a new row and orphaning the collection /
		// wishlist link.
		if (copy.entry.ownerId || copy.entry.wishlist) {
			const updatedCopy: StoredCopy = { scryfallId: newCard.id, entry: copy.entry };
			set((state) => ({
				decksCards: { ...state.decksCards, [deckId]: { ...current, [rowId]: updatedCopy } },
			}));

			// Mirror the change in the collection store if the copy lives there.
			const colEntries = useCollectionStore.getState().entries;
			if (colEntries[rowId]) {
				useCollectionStore.setState({
					entries: { ...colEntries, [rowId]: updatedCopy },
				});
			}

			// Mirror the change in the wishlist store if the copy lives there.
			const wishEntries = useWishlistStore.getState().entries;
			if (wishEntries[rowId]) {
				useWishlistStore.setState({
					entries: { ...wishEntries, [rowId]: updatedCopy },
				});
			}

			enqueue({
				type: SYNC_DECK_CARD_UPDATE,
				payload: { rowId, updates: { scryfall_id: newCard.id } },
			});
			triggerSync();
			return;
		}

		const newRowId = crypto.randomUUID();
		const newEntry: CardEntry = { ...copy.entry, rowId: newRowId, ownerId: undefined, deckId };
		// Rebuild preserving insertion order so the card stays at the same index in the list
		const next: Record<string, StoredCopy> = {};
		for (const [k, v] of Object.entries(current)) {
			next[k === rowId ? newRowId : k] =
				k === rowId ? { scryfallId: newCard.id, entry: newEntry } : v;
		}
		set((state) => ({ decksCards: { ...state.decksCards, [deckId]: next } }));

		// If the replaced card was a physical collection copy, free it (don't delete it)
		const isCollectionCopy = !!useCollectionStore.getState().entries[rowId];
		if (isCollectionCopy) {
			const userId = copy.entry.ownerId;
			if (userId) {
				const freedEntry: CardEntry = { ...copy.entry, deckId: undefined };
				// Update collection store: mark copy as free
				useCollectionStore.setState((state) => ({
					entries: {
						...state.entries,
						[rowId]: { scryfallId: copy.scryfallId, entry: freedEntry },
					},
				}));
				enqueue({ type: 'update', payload: { userId, rowId, entry: freedEntry } });
			} else {
				console.error(
					'[deck-store] changeDeckCardPrint: collection copy missing ownerId, falling back to deck-card-delete'
				);
				enqueue({ type: SYNC_DECK_CARD_DELETE, payload: { rowId } });
			}
		} else {
			enqueue({ type: SYNC_DECK_CARD_DELETE, payload: { rowId } });
		}

		enqueue({
			type: SYNC_DECK_CARD_INSERT,
			payload: { deckId, scryfallId: newCard.id, entry: newEntry },
		});
		triggerSync();
	},

	replaceDeckCardWithCollectionCopy: (
		deckCardRowId,
		collectionRowId,
		deckId,
		zone,
		userId,
		triggerSync
	) => {
		const current = get().decksCards[deckId] ?? {};

		// The deck card being replaced must exist
		const deckCard = current[deckCardRowId];
		if (!deckCard) return;

		// Get the collection copy from the collection store
		const ce = useCollectionStore.getState().entries[collectionRowId];
		const collectionCopy = ce ? { scryfallId: ce.scryfallId, entry: ce.entry } : null;

		if (!collectionCopy) return;

		// Guard: userId is required to persist this operation
		if (!userId) {
			console.error('[deck-store] replaceDeckCardWithCollectionCopy: userId absent, aborting');
			return;
		}

		const newTags = setDeckZone(collectionCopy.entry.tags, zone);
		const updatedEntry: CardEntry = {
			...collectionCopy.entry,
			deckId,
			tags: newTags,
			ownerId: userId,
		};

		// Update deck store
		const next = { ...current };
		delete next[deckCardRowId];
		next[collectionRowId] = { scryfallId: collectionCopy.scryfallId, entry: updatedEntry };
		set((state) => ({ decksCards: { ...state.decksCards, [deckId]: next } }));

		// Bump deck updatedAt
		const deck = get().decks[deckId];
		if (deck) {
			set((state) => ({
				decks: {
					...state.decks,
					[deckId]: { ...deck, updatedAt: new Date().toISOString() },
				},
			}));
		}

		// Update collection store so the copy no longer appears as free
		const colEntries = useCollectionStore.getState().entries;
		if (colEntries[collectionRowId]) {
			useCollectionStore.setState({
				entries: {
					...colEntries,
					[collectionRowId]: { scryfallId: collectionCopy.scryfallId, entry: updatedEntry },
				},
			});
		}

		enqueue({ type: SYNC_DECK_CARD_DELETE, payload: { rowId: deckCardRowId } });
		enqueue({ type: 'update', payload: { userId, rowId: collectionRowId, entry: updatedEntry } });
		triggerSync();
	},

	unassignCollectionCopyFromDeckCard: (deckCardRowId, deckId, zone, userId, triggerSync) => {
		const current = get().decksCards[deckId] ?? {};
		const deckCard = current[deckCardRowId];
		if (!deckCard) return;

		// Only owned copies can be unassigned.
		if (!deckCard.entry.ownerId) return;

		if (!userId) {
			console.error('[deck-store] unassignCollectionCopyFromDeckCard: userId absent, aborting');
			return;
		}

		// 1. Free the collection copy: remove from the deck, clear its deckId,
		//    keep it owned in the collection store.
		const freedEntry: CardEntry = { ...deckCard.entry, deckId: undefined };
		const next = { ...current };
		delete next[deckCardRowId];

		// 2. Create a fresh non-owned placeholder keeping the same scryfallId.
		const placeholderRowId = crypto.randomUUID();
		const placeholderEntry: CardEntry = {
			rowId: placeholderRowId,
			dateAdded: new Date().toISOString(),
			deckId,
			tags: setDeckZone(undefined, zone),
		};
		next[placeholderRowId] = { scryfallId: deckCard.scryfallId, entry: placeholderEntry };
		set((state) => ({ decksCards: { ...state.decksCards, [deckId]: next } }));

		// Bump deck updatedAt
		const deck = get().decks[deckId];
		if (deck) {
			set((state) => ({
				decks: {
					...state.decks,
					[deckId]: { ...deck, updatedAt: new Date().toISOString() },
				},
			}));
		}

		// Update collection store so the freed copy reappears as available.
		const colEntries = useCollectionStore.getState().entries;
		if (colEntries[deckCardRowId]) {
			useCollectionStore.setState({
				entries: {
					...colEntries,
					[deckCardRowId]: { scryfallId: deckCard.scryfallId, entry: freedEntry },
				},
			});
		}

		// Sync: free the owned copy (deck_id null) + insert the placeholder.
		enqueue({ type: 'update', payload: { userId, rowId: deckCardRowId, entry: freedEntry } });
		enqueue({
			type: SYNC_DECK_CARD_INSERT,
			payload: { deckId, scryfallId: deckCard.scryfallId, entry: placeholderEntry },
		});
		triggerSync();
	},

	getDeckCardCount: (deckId) => {
		return Object.keys(get().decksCards[deckId] ?? {}).length;
	},
}));
