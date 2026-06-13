'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { fetchCollectionPage } from '../db/collection';
import { enqueue, clearQueue } from '@/lib/supabase/sync-queue';
import type { CollectionData } from '../db/collection-migrations';
import {
	getCollectionFromCache,
	putCollectionEntriesInCache,
	clearCollectionCache,
} from '@/lib/scryfall/utils/card-cache';

type StoredCopy = { scryfallId: string; entry: CardEntry };

function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

type CollectionState = {
	entries: CollectionData;
	isLoaded: boolean;
	// true uniquement quand TOUTES les pages Supabase ont été chargées. isLoaded
	// passe true dès la 1re page (pour afficher vite), mais entries continue de
	// grandir page par page ; isFullyLoaded sert à geler la grille jusqu'à la fin.
	isFullyLoaded: boolean;
};

type CollectionActions = {
	// Supabase hydration
	hydrateFromSupabase: (userId: string, triggerSync: () => void) => Promise<void>;
	handleLogout: (userId: string | null) => void;

	// Mutations — all take triggerSync so the sync queue can be triggered
	addCard: (
		card: ScryfallCard,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>
	) => void;
	duplicateEntry: (
		scryfallId: string,
		sourceEntry: CardEntry,
		userId: string | null,
		triggerSync: () => void
	) => void;
	removeCard: (scryfallId: string, userId: string | null, triggerSync: () => void) => void;
	decrementCard: (scryfallId: string, userId: string | null, triggerSync: () => void) => void;
	removeEntry: (rowId: string, userId: string | null, triggerSync: () => void) => void;
	updateEntry: (
		rowId: string,
		updates: Partial<CardEntry>,
		userId: string | null,
		triggerSync: () => void
	) => void;
	changePrint: (
		rowId: string,
		newScryfallId: string,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>
	) => void;
	clearCollection: (userId: string | null, triggerSync: () => void) => void;
	importCards: (
		cards: Array<{ scryfallId: string; entry: CardEntry }>,
		userId: string | null,
		triggerSync: () => void
	) => void;

	// Deck assignment
	assignToDeck: (
		rowId: string,
		deckId: string,
		userId: string | null,
		triggerSync: () => void
	) => void;
	unassignFromDeck: (rowId: string, userId: string | null, triggerSync: () => void) => void;

	// Computed helpers
	getQuantity: (scryfallId: string) => number;
};

export const useCollectionStore = create<CollectionState & CollectionActions>()((set, get) => ({
	entries: {},
	isLoaded: false,
	isFullyLoaded: false,

	hydrateFromSupabase: async (userId, triggerSync) => {
		// Purge ancien cache localStorage (migration one-time)
		if (typeof window !== 'undefined') {
			localStorage.removeItem('wizcard-collection');
		}

		// Phase 1 : afficher le cache IndexedDB immédiatement
		const cached = await getCollectionFromCache();
		if (Object.keys(cached).length > 0) {
			set({ entries: cached, isLoaded: true });
		}

		// Phase 2 : fetch progressif depuis Supabase, page par page
		// On reconstruit depuis zéro pour ne pas merger avec un cache potentiellement périmé
		const fresh: CollectionData = {};
		let from = 0;
		while (true) {
			const { rows, hasMore } = await fetchCollectionPage(userId, from);
			for (const copy of rows) fresh[copy.entry.rowId] = copy;
			// isFullyLoaded reste false tant qu'il reste des pages : la grille est
			// gelée sur des skeletons jusqu'à ce que entries soit complet.
			set({ entries: { ...fresh }, isLoaded: true, isFullyLoaded: !hasMore });
			if (rows.length > 0) {
				void putCollectionEntriesInCache(
					rows.map((r) => ({ rowId: r.entry.rowId, scryfallId: r.scryfallId, entry: r.entry }))
				);
			}
			if (!hasMore) break;
			from += 1000;
		}
		// Si Supabase retourne une collection vide, s'assurer que le cache est bien vide
		if (Object.keys(fresh).length === 0) {
			void clearCollectionCache();
		}

		triggerSync();
	},

	handleLogout: (userId) => {
		if (typeof window === 'undefined') return;
		const signedIn = localStorage.getItem('wizcard-signed-in') === 'true';
		if (userId === null && signedIn) {
			localStorage.removeItem('wizcard-signed-in');
			clearQueue();
			void clearCollectionCache();
			set({ entries: {}, isLoaded: true, isFullyLoaded: true });
		} else if (userId === null) {
			set({ isLoaded: true, isFullyLoaded: true });
		}
	},

	addCard: (card, userId, triggerSync, entryPatch) => {
		const newRowId = crypto.randomUUID();
		const entry = newEntry(newRowId, entryPatch);
		set((state) => ({
			entries: { [newRowId]: { scryfallId: card.id, entry }, ...state.entries },
		}));
		if (userId) {
			enqueue({
				type: 'insert',
				payload: { userId, rowId: newRowId, scryfallId: card.id, entry },
			});
			triggerSync();
		}
	},

	duplicateEntry: (scryfallId, sourceEntry, userId, triggerSync) => {
		const newRowId = crypto.randomUUID();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { rowId: _rowId, dateAdded: _dateAdded, ...meta } = sourceEntry;
		const entry = newEntry(newRowId, meta);
		set((state) => ({
			entries: { [newRowId]: { scryfallId, entry }, ...state.entries },
		}));
		if (userId) {
			enqueue({ type: 'insert', payload: { userId, rowId: newRowId, scryfallId, entry } });
			triggerSync();
		}
	},

	removeCard: (scryfallId, userId, triggerSync) => {
		const current = get().entries;
		const next = { ...current };
		const removedRowIds: string[] = [];
		for (const [rowId, copy] of Object.entries(next)) {
			if (copy.scryfallId === scryfallId) {
				delete next[rowId];
				removedRowIds.push(rowId);
			}
		}
		set({ entries: next });
		if (userId) {
			for (const rowId of removedRowIds) {
				enqueue({ type: 'delete', payload: { userId, rowId } });
			}
			triggerSync();
		}
	},

	decrementCard: (scryfallId, userId, triggerSync) => {
		const current = get().entries;
		const copies = Object.entries(current)
			.filter(([, copy]) => copy.scryfallId === scryfallId)
			.sort((a, b) => b[1].entry.dateAdded.localeCompare(a[1].entry.dateAdded));
		if (copies.length === 0) return;
		const [rowId] = copies[0];
		const next = { ...current };
		delete next[rowId];
		set({ entries: next });
		if (userId) {
			enqueue({ type: 'delete', payload: { userId, rowId } });
			triggerSync();
		}
	},

	updateEntry: (rowId, updates, userId, triggerSync) => {
		const current = get().entries;
		const copy = current[rowId];
		if (!copy) return;
		const updatedEntry: CardEntry = { ...copy.entry, ...updates };
		set({ entries: { ...current, [rowId]: { ...copy, entry: updatedEntry } } });
		if (userId) {
			enqueue({ type: 'update', payload: { userId, rowId, entry: updatedEntry } });
			triggerSync();
		}
	},

	changePrint: (rowId, newScryfallId, userId, triggerSync, entryPatch) => {
		const current = get().entries;
		const copy = current[rowId];
		if (!copy) return;
		const newRowId = crypto.randomUUID();
		const newCopy: StoredCopy = {
			scryfallId: newScryfallId,
			entry: { ...copy.entry, rowId: newRowId, ...entryPatch },
		};
		// Rebuild preserving insertion order so the card stays at the same position
		const next: typeof current = {};
		for (const key of Object.keys(current)) {
			if (key === rowId) {
				next[newRowId] = newCopy;
			} else {
				next[key] = current[key];
			}
		}
		if (userId) {
			enqueue({ type: 'delete', payload: { userId, rowId } });
			enqueue({
				type: 'insert',
				payload: {
					userId,
					rowId: newRowId,
					scryfallId: newScryfallId,
					entry: newCopy.entry,
				},
			});
		}
		set({ entries: next });
		if (userId) triggerSync();
	},

	removeEntry: (rowId, userId, triggerSync) => {
		const current = get().entries;
		if (!current[rowId]) return;
		const next = { ...current };
		delete next[rowId];
		set({ entries: next });
		if (userId) {
			enqueue({ type: 'delete', payload: { userId, rowId } });
			triggerSync();
		}
	},

	clearCollection: (userId, triggerSync) => {
		const current = get().entries;
		set({ entries: {} });
		if (userId) {
			const rowIds = Object.keys(current);
			if (rowIds.length > 0) {
				enqueue({ type: 'bulk-delete', payload: { userId, rowIds } });
			}
			triggerSync();
		}
	},

	importCards: (cards, userId, triggerSync) => {
		const current = get().entries;
		const next = { ...current };
		const toInsert: Array<{ rowId: string; scryfallId: string; entry: CardEntry }> = [];
		for (const card of cards) {
			const rowId = card.entry.rowId;
			next[rowId] = { scryfallId: card.scryfallId, entry: card.entry };
			toInsert.push({ rowId, scryfallId: card.scryfallId, entry: card.entry });
		}
		set({ entries: next });
		if (userId && toInsert.length > 0) {
			enqueue({ type: 'bulk-insert', payload: { userId, rows: toInsert } });
			triggerSync();
		}
	},

	assignToDeck: (rowId, deckId, userId, triggerSync) => {
		const current = get().entries;
		const copy = current[rowId];
		if (!copy) return;
		const updatedEntry: CardEntry = { ...copy.entry, deckId };
		set({ entries: { ...current, [rowId]: { ...copy, entry: updatedEntry } } });
		if (userId) {
			enqueue({ type: 'update', payload: { userId, rowId, entry: updatedEntry } });
			triggerSync();
		}
	},

	unassignFromDeck: (rowId, userId, triggerSync) => {
		const current = get().entries;
		const copy = current[rowId];
		if (!copy) return;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { deckId: _deckId, ...rest } = copy.entry;
		const updatedEntry: CardEntry = rest;
		set({ entries: { ...current, [rowId]: { ...copy, entry: updatedEntry } } });
		if (userId) {
			enqueue({ type: 'update', payload: { userId, rowId, entry: updatedEntry } });
			triggerSync();
		}
	},

	getQuantity: (scryfallId) => {
		return Object.values(get().entries).filter((c) => c.scryfallId === scryfallId).length;
	},
}));
