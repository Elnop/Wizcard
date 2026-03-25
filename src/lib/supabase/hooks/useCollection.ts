'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { fetchCollection } from '@/lib/supabase/collection';
import { enqueue, clearQueue } from '@/lib/supabase/sync-queue';

const STORAGE_KEY = 'mtg-snap-collection';

// Lightweight per-copy record stored in localStorage (no Scryfall data)
type StoredCopy = { scryfallId: string; entry: CardEntry };
type CollectionData = Record<string, StoredCopy>; // key = rowId

const EMPTY: CollectionData = {};
let listeners: Array<() => void> = [];
let cachedSnapshot: CollectionData | null = null;

function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

function getSnapshot(): CollectionData {
	if (cachedSnapshot !== null) return cachedSnapshot;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			cachedSnapshot = EMPTY;
			return EMPTY;
		}
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		// Detect legacy format (values have scryfallId/count/rowIds) and migrate
		const migrated: CollectionData = {};
		for (const value of Object.values(parsed)) {
			if (!value || typeof value !== 'object') continue;
			const obj = value as Record<string, unknown>;

			// New format: { scryfallId, entry: { rowId, dateAdded, ... } }
			if (typeof obj.scryfallId === 'string' && obj.entry && typeof obj.entry === 'object') {
				const entry = obj.entry as CardEntry;
				migrated[entry.rowId] = { scryfallId: obj.scryfallId, entry };
				continue;
			}

			// Legacy CollectionStack format: { scryfallId, count, rowIds, meta }
			if (
				typeof obj.scryfallId === 'string' &&
				Array.isArray(obj.rowIds) &&
				obj.meta &&
				typeof obj.meta === 'object'
			) {
				const meta = obj.meta as Record<string, unknown>;
				const rowIds = obj.rowIds as string[];
				for (const rowId of rowIds) {
					const entry: CardEntry = {
						rowId,
						dateAdded: (meta.dateAdded as string) ?? new Date().toISOString(),
						isFoil: meta.isFoil as boolean | undefined,
						foilType: meta.foilType as 'foil' | 'etched' | undefined,
						condition: meta.condition as CardEntry['condition'],
						language: meta.language as CardEntry['language'],
						purchasePrice: meta.purchasePrice as string | undefined,
						forTrade: meta.forTrade as boolean | undefined,
						alter: meta.alter as boolean | undefined,
						proxy: meta.proxy as boolean | undefined,
						tags: meta.tags as string[] | undefined,
					};
					migrated[rowId] = { scryfallId: obj.scryfallId, entry };
				}
				continue;
			}

			// Legacy with cardId instead of scryfallId
			if (
				typeof obj.cardId === 'string' &&
				Array.isArray(obj.rowIds) &&
				obj.meta &&
				typeof obj.meta === 'object'
			) {
				const meta = obj.meta as Record<string, unknown>;
				const rowIds = obj.rowIds as string[];
				for (const rowId of rowIds) {
					const entry: CardEntry = {
						rowId,
						dateAdded: (meta.dateAdded as string) ?? new Date().toISOString(),
						isFoil: meta.isFoil as boolean | undefined,
						foilType: meta.foilType as 'foil' | 'etched' | undefined,
						condition: meta.condition as CardEntry['condition'],
						language: meta.language as CardEntry['language'],
						purchasePrice: meta.purchasePrice as string | undefined,
						forTrade: meta.forTrade as boolean | undefined,
						alter: meta.alter as boolean | undefined,
						proxy: meta.proxy as boolean | undefined,
						tags: meta.tags as string[] | undefined,
					};
					migrated[rowId] = { scryfallId: obj.cardId, entry };
				}
				continue;
			}

			// Legacy flat format: { id, quantity, dateAdded, ... }
			if (typeof obj.id === 'string') {
				const count = (obj.quantity as number) ?? 1;
				const rowIds = Array.from({ length: count }, () => crypto.randomUUID());
				for (const rowId of rowIds) {
					const entry: CardEntry = {
						rowId,
						dateAdded: (obj.dateAdded as string) ?? new Date().toISOString(),
						isFoil: obj.isFoil as boolean | undefined,
						foilType: obj.foilType as 'foil' | 'etched' | undefined,
						condition: obj.condition as CardEntry['condition'],
						language: obj.language as CardEntry['language'],
						tags: obj.tags as string[] | undefined,
						purchasePrice: obj.purchasePrice as string | undefined,
						forTrade: obj.forTrade as boolean | undefined,
						alter: obj.alter as boolean | undefined,
						proxy: obj.proxy as boolean | undefined,
					};
					migrated[rowId] = { scryfallId: obj.id, entry };
				}
				continue;
			}
		}
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
		} catch (err) {
			console.error('[useCollection] failed to write migrated collection to localStorage:', err);
		}
		cachedSnapshot = migrated;
		return migrated;
	} catch (err) {
		console.error('[useCollection] failed to read collection from localStorage:', err);
		cachedSnapshot = EMPTY;
		return EMPTY;
	}
}

function getServerSnapshot(): CollectionData {
	return EMPTY;
}

function emitChange() {
	cachedSnapshot = null;
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void) {
	listeners = [...listeners, listener];
	return () => {
		listeners = listeners.filter((l) => l !== listener);
	};
}

function saveCollection(data: CollectionData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch (err) {
		console.error('[useCollection] failed to save collection to localStorage:', err);
		return;
	}
	emitChange();
}

export function useCollection(
	userId: string | null,
	authLoading: boolean,
	triggerSync: () => void = () => {}
) {
	const collection = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const [isLoaded, setIsLoaded] = useState(!userId && !authLoading);
	const prevUserIdRef = useRef<string | null | undefined>(undefined);

	// Hydrate from Supabase on login
	useEffect(() => {
		if (authLoading) return;

		const prevUserId = prevUserIdRef.current;
		prevUserIdRef.current = userId;

		if (!userId) {
			if (typeof window !== 'undefined' && localStorage.getItem('mtg-snap-signed-in') === 'true') {
				localStorage.removeItem('mtg-snap-signed-in');
				saveCollection({});
				clearQueue();
			}
			setTimeout(() => setIsLoaded(true), 0);
			return;
		}

		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			saveCollection({});
			clearQueue();
			localStorage.removeItem('mtg-snap-signed-in');
		}

		localStorage.setItem('mtg-snap-signed-in', 'true');

		const localBeforeFetch = getSnapshot();

		setTimeout(() => setIsLoaded(true), 0);

		fetchCollection(userId).then((remoteCopies) => {
			if (remoteCopies.length === 0 && Object.keys(localBeforeFetch).length > 0) {
				return;
			}

			const remoteRowIds = new Set(remoteCopies.map((c) => c.entry.rowId));

			// Upload local copies that don't exist in remote
			for (const [rowId, copy] of Object.entries(localBeforeFetch)) {
				if (!remoteRowIds.has(rowId)) {
					enqueue({
						type: 'insert',
						payload: { userId, rowId, scryfallId: copy.scryfallId, entry: copy.entry },
					});
				}
			}

			// Remote wins: merge (remote overwrites local for same rowId)
			const currentLocal = getSnapshot();
			const merged: CollectionData = { ...currentLocal };
			for (const copy of remoteCopies) {
				merged[copy.entry.rowId] = copy;
			}
			saveCollection(merged);
		});
	}, [userId, authLoading]);

	const addCard = useCallback(
		(card: ScryfallCard) => {
			const current = getSnapshot();
			const newRowId = crypto.randomUUID();
			const entry = newEntry(newRowId);
			const next: CollectionData = {
				[newRowId]: { scryfallId: card.id, entry },
				...current,
			};
			saveCollection(next);
			if (userId) {
				enqueue({
					type: 'insert',
					payload: { userId, rowId: newRowId, scryfallId: card.id, entry },
				});
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const duplicateEntry = useCallback(
		(scryfallId: string, sourceEntry: CardEntry) => {
			const current = getSnapshot();
			const newRowId = crypto.randomUUID();
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { rowId: _rowId, dateAdded: _dateAdded, ...meta } = sourceEntry;
			const entry = newEntry(newRowId, meta);
			const next: CollectionData = {
				[newRowId]: { scryfallId, entry },
				...current,
			};
			saveCollection(next);
			if (userId) {
				enqueue({
					type: 'insert',
					payload: { userId, rowId: newRowId, scryfallId, entry },
				});
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const removeCard = useCallback(
		(scryfallId: string) => {
			const current = getSnapshot();
			const next = { ...current };
			const removedRowIds: string[] = [];
			for (const [rowId, copy] of Object.entries(next)) {
				if (copy.scryfallId === scryfallId) {
					delete next[rowId];
					removedRowIds.push(rowId);
				}
			}
			saveCollection(next);
			if (userId) {
				for (const rowId of removedRowIds) {
					enqueue({ type: 'delete', payload: { userId, rowId } });
				}
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const decrementCard = useCallback(
		(scryfallId: string) => {
			const current = getSnapshot();
			// Remove the last-added copy with this scryfallId
			const copies = Object.entries(current)
				.filter(([, copy]) => copy.scryfallId === scryfallId)
				.sort((a, b) => b[1].entry.dateAdded.localeCompare(a[1].entry.dateAdded));
			if (copies.length === 0) return;
			const [rowId] = copies[0];
			const next = { ...current };
			delete next[rowId];
			saveCollection(next);
			if (userId) {
				enqueue({ type: 'delete', payload: { userId, rowId } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const updateEntry = useCallback(
		(rowId: string, updates: Partial<CardEntry>) => {
			const current = getSnapshot();
			const copy = current[rowId];
			if (!copy) return;
			const updatedEntry: CardEntry = { ...copy.entry, ...updates };
			saveCollection({ ...current, [rowId]: { ...copy, entry: updatedEntry } });
			if (userId) {
				enqueue({ type: 'update', payload: { userId, rowId, entry: updatedEntry } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const changePrint = useCallback(
		(rowId: string, newScryfallId: string, entryPatch?: Partial<CardEntry>) => {
			const current = getSnapshot();
			const copy = current[rowId];
			if (!copy) return;
			const newRowId = crypto.randomUUID();
			const newCopy: StoredCopy = {
				scryfallId: newScryfallId,
				entry: { ...copy.entry, rowId: newRowId, ...entryPatch },
			};
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
					payload: { userId, rowId: newRowId, scryfallId: newScryfallId, entry: newCopy.entry },
				});
			}
			saveCollection(next);
			if (userId) triggerSync();
		},
		[userId, triggerSync]
	);

	const removeEntry = useCallback(
		(rowId: string) => {
			const current = getSnapshot();
			if (!current[rowId]) return;
			const next = { ...current };
			delete next[rowId];
			saveCollection(next);
			if (userId) {
				enqueue({ type: 'delete', payload: { userId, rowId } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const clearCollection = useCallback(() => {
		const current = getSnapshot();
		saveCollection({});
		if (userId) {
			for (const rowId of Object.keys(current)) {
				enqueue({ type: 'delete', payload: { userId, rowId } });
			}
			triggerSync();
		}
	}, [userId, triggerSync]);

	const importCards = useCallback(
		(cards: Array<{ scryfallId: string; entry: CardEntry }>) => {
			const current = getSnapshot();
			const next = { ...current };
			const toInsert: Array<{ rowId: string; scryfallId: string; entry: CardEntry }> = [];

			for (const card of cards) {
				const rowId = card.entry.rowId;
				next[rowId] = { scryfallId: card.scryfallId, entry: card.entry };
				toInsert.push({ rowId, scryfallId: card.scryfallId, entry: card.entry });
			}

			saveCollection(next);

			if (userId && toInsert.length > 0) {
				enqueue({ type: 'bulk-insert', payload: { userId, rows: toInsert } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const getQuantity = useCallback(
		(scryfallId: string): number => {
			return Object.values(collection).filter((c) => c.scryfallId === scryfallId).length;
		},
		[collection]
	);

	// entries: lightweight list for useCollectionCards to hydrate
	const entries = useMemo(() => Object.values(collection), [collection]);

	return {
		collection,
		entries,
		isLoaded,
		addCard,
		duplicateEntry,
		removeCard,
		removeEntry,
		decrementCard,
		updateEntry,
		changePrint,
		getQuantity,
		clearCollection,
		importCards,
	};
}
