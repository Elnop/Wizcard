'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { DeckMeta, DeckZone, FolderMeta } from '@/types/decks';
import { setDeckZone } from '@/types/decks';
import { fetchDecks, fetchDeckCards } from '../db/decks';
import { fetchFolders } from '../db/folders';
import { enqueue } from '@/lib/supabase/sync-queue';

type StoredCopy = { scryfallId: string; entry: CardEntry };

type DeckState = {
	decks: Record<string, DeckMeta>;
	folders: Record<string, FolderMeta>;
	activeDeckId: string | null;
	activeDeckCards: Record<string, StoredCopy>;
	isLoaded: boolean;
};

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
		updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>,
		userId: string,
		triggerSync: () => void
	) => void;
	deleteDeck: (deckId: string, userId: string, triggerSync: () => void) => void;

	addCardToDeck: (
		deckId: string,
		card: ScryfallCard,
		zone: DeckZone,
		userId: string,
		triggerSync: () => void
	) => void;
	bulkAddCardsToDeck: (
		deckId: string,
		cards: Array<{ card: ScryfallCard; zone: DeckZone; quantity: number }>,
		userId: string,
		triggerSync: () => void
	) => void;
	removeCardFromDeck: (rowId: string, triggerSync: () => void) => void;
	changeZone: (rowId: string, zone: DeckZone, triggerSync: () => void) => void;
	updateDeckCard: (
		rowId: string,
		updates: { tags?: string[]; owner_id?: string | null },
		triggerSync: () => void
	) => void;
	toggleOwned: (rowId: string, userId: string, triggerSync: () => void) => void;

	getDeckCardCount: (deckId: string) => number;
};

export const useDeckStore = create<DeckState & DeckActions>()((set, get) => ({
	decks: {},
	folders: {},
	activeDeckId: null,
	activeDeckCards: {},
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
		set({ activeDeckId: deckId, activeDeckCards: cards });
	},

	handleLogout: () => {
		set({ decks: {}, folders: {}, activeDeckId: null, activeDeckCards: {}, isLoaded: false });
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
			name,
			format,
			description,
			folderId: folderId ?? null,
			createdAt: now,
			updatedAt: now,
		};
		set((state) => ({ decks: { ...state.decks, [id]: deck } }));
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

	deleteDeck: (deckId, userId, triggerSync) => {
		const next = { ...get().decks };
		delete next[deckId];
		const stateUpdate: Partial<DeckState> = { decks: next };
		if (get().activeDeckId === deckId) {
			stateUpdate.activeDeckId = null;
			stateUpdate.activeDeckCards = {};
		}
		set(stateUpdate);
		enqueue({ type: 'deck-delete', payload: { userId, deckId } });
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
		if (get().activeDeckId === deckId) {
			set((state) => ({
				activeDeckCards: {
					...state.activeDeckCards,
					[rowId]: { scryfallId: card.id, entry },
				},
			}));
		}
		enqueue({
			type: 'deck-card-insert',
			payload: { deckId, scryfallId: card.id, entry },
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

	bulkAddCardsToDeck: (deckId, cards, userId, triggerSync) => {
		const now = new Date().toISOString();
		const newCards: Record<string, StoredCopy> = {};
		const syncPayload: Array<{ scryfallId: string; entry: CardEntry }> = [];

		for (const { card, zone, quantity } of cards) {
			for (let i = 0; i < quantity; i++) {
				const rowId = crypto.randomUUID();
				const entry: CardEntry = {
					rowId,
					dateAdded: now,
					deckId,
					tags: setDeckZone(undefined, zone),
				};
				newCards[rowId] = { scryfallId: card.id, entry };
				syncPayload.push({ scryfallId: card.id, entry });
			}
		}

		set((state) => ({
			activeDeckId: deckId,
			activeDeckCards: { ...state.activeDeckCards, ...newCards },
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

	removeCardFromDeck: (rowId, triggerSync) => {
		const current = get().activeDeckCards;
		if (!current[rowId]) return;
		const next = { ...current };
		delete next[rowId];
		set({ activeDeckCards: next });
		enqueue({ type: 'deck-card-delete', payload: { rowId } });
		triggerSync();
	},

	changeZone: (rowId, zone, triggerSync) => {
		const current = get().activeDeckCards;
		const copy = current[rowId];
		if (!copy) return;
		const newTags = setDeckZone(copy.entry.tags, zone);
		const updatedEntry: CardEntry = { ...copy.entry, tags: newTags };
		set({
			activeDeckCards: {
				...current,
				[rowId]: { ...copy, entry: updatedEntry },
			},
		});
		enqueue({ type: 'deck-card-update', payload: { rowId, updates: { tags: newTags } } });
		triggerSync();
	},

	updateDeckCard: (rowId, updates, triggerSync) => {
		const current = get().activeDeckCards;
		const copy = current[rowId];
		if (!copy) return;
		const updatedEntry: CardEntry = { ...copy.entry };
		if (updates.tags) updatedEntry.tags = updates.tags;
		set({
			activeDeckCards: {
				...current,
				[rowId]: { ...copy, entry: updatedEntry },
			},
		});
		enqueue({ type: 'deck-card-update', payload: { rowId, updates } });
		triggerSync();
	},

	toggleOwned: (rowId, userId, triggerSync) => {
		const current = get().activeDeckCards;
		const copy = current[rowId];
		if (!copy) return;
		const isCurrentlyOwned = !!copy.entry.deckId && copy.entry.forTrade !== undefined;
		const newOwnerId = isCurrentlyOwned ? null : userId;
		const updates = { owner_id: newOwnerId };
		set({
			activeDeckCards: {
				...current,
				[rowId]: { ...copy, entry: { ...copy.entry } },
			},
		});
		enqueue({ type: 'deck-card-update', payload: { rowId, updates } });
		triggerSync();
	},

	getDeckCardCount: (deckId) => {
		if (get().activeDeckId === deckId) {
			return Object.keys(get().activeDeckCards).length;
		}
		return 0;
	},
}));
