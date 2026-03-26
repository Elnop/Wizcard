'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { fetchCollection } from '../db/collection';
import { enqueue, clearQueue } from '@/lib/supabase/sync-queue';
import { migrateCollectionData, type CollectionData } from '../db/collection-migrations';

type StoredCopy = { scryfallId: string; entry: CardEntry };

function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

type CollectionState = {
	entries: CollectionData;
	isLoaded: boolean;
};

type CollectionActions = {
	// Supabase hydration
	hydrateFromSupabase: (userId: string, triggerSync: () => void) => Promise<void>;
	handleLogout: (userId: string | null) => void;

	// Mutations — all take triggerSync so the sync queue can be triggered
	addCard: (card: ScryfallCard, userId: string | null, triggerSync: () => void) => void;
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

	// Computed helpers
	getQuantity: (scryfallId: string) => number;
};

const STORAGE_KEY = 'mtg-snap-collection';

export const useCollectionStore = create<CollectionState & CollectionActions>()(
	persist(
		(set, get) => ({
			entries: {},
			isLoaded: false,

			hydrateFromSupabase: async (userId, triggerSync) => {
				const localEntries = get().entries;

				set({ isLoaded: true });

				const remoteCopies = await fetchCollection(userId);

				if (remoteCopies.length === 0 && Object.keys(localEntries).length > 0) {
					return;
				}

				const remoteRowIds = new Set(remoteCopies.map((c) => c.entry.rowId));

				// Upload local copies that don't exist in remote
				for (const [rowId, copy] of Object.entries(localEntries)) {
					if (!remoteRowIds.has(rowId)) {
						enqueue({
							type: 'insert',
							payload: { userId, rowId, scryfallId: copy.scryfallId, entry: copy.entry },
						});
					}
				}

				// Remote wins: merge (remote overwrites local for same rowId)
				const currentEntries = get().entries;
				const merged: CollectionData = { ...currentEntries };
				for (const copy of remoteCopies) {
					merged[copy.entry.rowId] = copy;
				}
				set({ entries: merged });
				triggerSync();
			},

			handleLogout: (userId) => {
				if (typeof window === 'undefined') return;
				const signedIn = localStorage.getItem('mtg-snap-signed-in') === 'true';
				if (userId === null && signedIn) {
					localStorage.removeItem('mtg-snap-signed-in');
					clearQueue();
					set({ entries: {}, isLoaded: true });
				} else if (userId === null) {
					set({ isLoaded: true });
				}
			},

			addCard: (card, userId, triggerSync) => {
				const newRowId = crypto.randomUUID();
				const entry = newEntry(newRowId);
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
					for (const rowId of Object.keys(current)) {
						enqueue({ type: 'delete', payload: { userId, rowId } });
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

			getQuantity: (scryfallId) => {
				return Object.values(get().entries).filter((c) => c.scryfallId === scryfallId).length;
			},
		}),
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(() => localStorage),
			// Only persist entries, not isLoaded
			partialize: (state) => ({ entries: state.entries }),
			// Run migration on hydration from localStorage
			merge: (persisted, current) => {
				const persistedState = persisted as { entries?: Record<string, unknown> };
				if (!persistedState.entries) return current;
				// Migrate entries — handles all legacy formats
				const migrated = migrateCollectionData(persistedState.entries);
				return { ...current, entries: migrated };
			},
		}
	)
);
