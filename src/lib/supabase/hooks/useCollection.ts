'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CollectionStack, StackMeta } from '@/types/card';
import { fetchCollection } from '@/lib/supabase/collection';
import { enqueue, clearQueue } from '@/lib/supabase/sync-queue';

const STORAGE_KEY = 'mtg-snap-collection';

type CollectionData = Record<string, CollectionStack>;

const EMPTY: CollectionData = {};
let listeners: Array<() => void> = [];
let cachedSnapshot: CollectionData | null = null;

function newMeta(overrides?: Partial<StackMeta>): StackMeta {
	return { dateAdded: new Date().toISOString(), ...overrides };
}

// Migrate legacy entries (old format with {id, quantity, ...meta}) to CollectionStack
export function migrateStack(raw: unknown): CollectionStack | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;

	// Already new format
	if ('scryfallId' in obj && 'count' in obj && 'rowIds' in obj) {
		return raw as CollectionStack;
	}

	// Legacy format 0: old new format with cardId (pre-rename)
	if ('cardId' in obj && 'count' in obj && 'rowIds' in obj) {
		const legacy = raw as { cardId: string; count: number; meta: StackMeta; rowIds: string[] };
		return {
			scryfallId: legacy.cardId,
			count: legacy.count,
			meta: legacy.meta,
			rowIds: legacy.rowIds,
		};
	}

	// Legacy format 1: { card: ScryfallCard, quantity, dateAdded }
	if ('card' in obj && typeof obj.card === 'object') {
		const legacy = raw as { card: { id: string }; quantity: number; dateAdded: string };
		const count = legacy.quantity ?? 1;
		return {
			scryfallId: legacy.card.id,
			count,
			meta: { dateAdded: legacy.dateAdded ?? new Date().toISOString() },
			rowIds: Array.from({ length: count }, () => crypto.randomUUID()),
		};
	}

	// Legacy format 2: flat StoredCard / CollectionEntry
	const id = obj.id as string;
	if (!id) return null;
	const count = (obj.quantity as number) ?? 1;
	return {
		scryfallId: id,
		count,
		meta: {
			dateAdded: (obj.dateAdded as string) ?? new Date().toISOString(),
			isFoil: obj.isFoil as boolean | undefined,
			foilType: obj.foilType as 'foil' | 'etched' | undefined,
			condition: obj.condition as string | undefined,
			language: obj.language as string | undefined,
			tags: obj.tags as string[] | undefined,
			purchasePrice: obj.purchasePrice as string | undefined,
			forTrade: obj.forTrade as boolean | undefined,
			alter: obj.alter as boolean | undefined,
			proxy: obj.proxy as boolean | undefined,
		},
		rowIds: Array.from({ length: count }, () => crypto.randomUUID()),
	};
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
		const migrated: CollectionData = {};
		let needsWrite = false;
		for (const [key, entry] of Object.entries(parsed)) {
			const stack = migrateStack(entry);
			if (!stack) continue;
			// Use scryfallId as key (legacy used Scryfall id directly as key)
			migrated[stack.scryfallId] = stack;
			if (
				entry !== stack &&
				typeof entry === 'object' &&
				entry !== null &&
				('card' in (entry as object) ||
					'name' in (entry as object) ||
					'quantity' in (entry as object))
			) {
				needsWrite = true;
			}
			if (key !== stack.scryfallId) needsWrite = true;
		}
		if (needsWrite) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
			} catch (err) {
				console.error('[useCollection] failed to write migrated collection to localStorage:', err);
			}
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
			// Only wipe local data on explicit sign-out (not on initial load before session resolves)
			if (typeof window !== 'undefined' && localStorage.getItem('mtg-snap-signed-in') === 'true') {
				localStorage.removeItem('mtg-snap-signed-in');
				saveCollection({});
				clearQueue();
			}
			setTimeout(() => setIsLoaded(true), 0);
			return;
		}

		// User switched without going through null (auth batching): wipe previous user's data first
		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			saveCollection({});
			clearQueue();
			localStorage.removeItem('mtg-snap-signed-in');
		}

		localStorage.setItem('mtg-snap-signed-in', 'true');

		// P0-C: Capture local state BEFORE fetch to avoid race condition where
		// user mutations during fetch would be overwritten by the stale pre-fetch snapshot.
		const localBeforeFetch = getSnapshot();

		// P2-A: Show local collection immediately, reconcile in background
		setTimeout(() => setIsLoaded(true), 0);

		fetchCollection(userId).then((remoteStacks) => {
			// If Supabase returns nothing but we have local data, assume network/auth error — don't overwrite
			if (remoteStacks.length === 0 && Object.keys(localBeforeFetch).length > 0) {
				return;
			}

			const remoteByScryfallId = Object.fromEntries(remoteStacks.map((s) => [s.scryfallId, s]));

			// Upload local copies (captured before fetch) that don't exist in remote
			for (const stack of Object.values(localBeforeFetch)) {
				const remoteStack = remoteByScryfallId[stack.scryfallId];
				const remoteRowIds = new Set(remoteStack?.rowIds ?? []);
				for (const rowId of stack.rowIds) {
					if (!remoteRowIds.has(rowId)) {
						enqueue({
							type: 'insert',
							payload: { userId, rowId, scryfallId: stack.scryfallId, meta: stack.meta },
						});
					}
				}
			}

			// Remote wins: merge stacks (remote meta overwrites local meta)
			// Start from current snapshot (may have mutations from during fetch)
			const currentLocal = getSnapshot();
			const merged: CollectionData = { ...currentLocal };
			for (const remoteStack of remoteStacks) {
				merged[remoteStack.scryfallId] = remoteStack;
			}
			saveCollection(merged);
		});
	}, [userId, authLoading]);

	const addCard = useCallback(
		(card: ScryfallCard) => {
			const current = getSnapshot();
			const existing = current[card.id];
			const newRowId = crypto.randomUUID();
			let nextStack: CollectionStack;
			if (existing) {
				nextStack = {
					...existing,
					count: existing.count + 1,
					rowIds: [...existing.rowIds, newRowId],
				};
			} else {
				nextStack = {
					scryfallId: card.id,
					count: 1,
					meta: newMeta(),
					rowIds: [newRowId],
				};
			}
			saveCollection({ ...current, [card.id]: nextStack });
			if (userId) {
				enqueue({
					type: 'insert',
					payload: { userId, rowId: newRowId, scryfallId: card.id, meta: nextStack.meta },
				});
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const removeCard = useCallback(
		(cardId: string) => {
			const current = getSnapshot();
			const stack = current[cardId];
			if (!stack) return;
			const next = { ...current };
			delete next[cardId];
			saveCollection(next);
			if (userId) {
				for (const rowId of stack.rowIds) {
					enqueue({ type: 'delete', payload: { userId, rowId } });
				}
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const decrementCard = useCallback(
		(cardId: string) => {
			const current = getSnapshot();
			const existing = current[cardId];
			if (!existing) return;
			const rowIds = [...existing.rowIds];
			const removedRowId = rowIds.pop()!;
			if (existing.count <= 1) {
				const next = { ...current };
				delete next[cardId];
				saveCollection(next);
			} else {
				const updated: CollectionStack = { ...existing, count: existing.count - 1, rowIds };
				saveCollection({ ...current, [cardId]: updated });
			}
			if (userId) {
				enqueue({ type: 'delete', payload: { userId, rowId: removedRowId } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const updateEntry = useCallback(
		(cardId: string, updates: Partial<StackMeta>) => {
			const current = getSnapshot();
			const stack = current[cardId];
			if (!stack) return;
			const updatedMeta: StackMeta = { ...stack.meta, ...updates };
			const updated: CollectionStack = { ...stack, meta: updatedMeta };
			saveCollection({ ...current, [cardId]: updated });
			if (userId) {
				enqueue({ type: 'update', payload: { userId, rowIds: stack.rowIds, meta: updatedMeta } });
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const changePrint = useCallback(
		(oldCardId: string, newCardId: string) => {
			const current = getSnapshot();
			const oldStack = current[oldCardId];
			if (!oldStack) return;

			const next = { ...current };
			delete next[oldCardId];

			// Generate new rowIds for the new print
			const newRowIds = Array.from({ length: oldStack.count }, () => crypto.randomUUID());
			const existingNew = next[newCardId];
			if (existingNew) {
				// Merge into existing stack
				next[newCardId] = {
					...existingNew,
					count: existingNew.count + oldStack.count,
					rowIds: [...existingNew.rowIds, ...newRowIds],
				};
			} else {
				next[newCardId] = {
					scryfallId: newCardId,
					count: oldStack.count,
					meta: oldStack.meta,
					rowIds: newRowIds,
				};
			}

			saveCollection(next);

			if (userId) {
				// Delete old rows
				for (const rowId of oldStack.rowIds) {
					enqueue({ type: 'delete', payload: { userId, rowId } });
				}
				// Insert new rows
				const targetStack = next[newCardId];
				for (const rowId of newRowIds) {
					enqueue({
						type: 'insert',
						payload: { userId, rowId, scryfallId: newCardId, meta: targetStack.meta },
					});
				}
				triggerSync();
			}
		},
		[userId, triggerSync]
	);

	const clearCollection = useCallback(() => {
		const current = getSnapshot();
		saveCollection({});
		if (userId) {
			for (const stack of Object.values(current)) {
				for (const rowId of stack.rowIds) {
					enqueue({ type: 'delete', payload: { userId, rowId } });
				}
			}
			triggerSync();
		}
	}, [userId, triggerSync]);

	const importCards = useCallback(
		(cards: Array<ScryfallCard & { count: number; meta: StackMeta }>) => {
			const current = getSnapshot();
			const next = { ...current };
			const toInsert: Array<{ rowId: string; scryfallId: string; meta: StackMeta }> = [];

			for (const card of cards) {
				const newRowIds = Array.from({ length: card.count }, () => crypto.randomUUID());
				const existing = next[card.id];
				if (existing) {
					next[card.id] = {
						...existing,
						count: existing.count + card.count,
						rowIds: [...existing.rowIds, ...newRowIds],
					};
				} else {
					next[card.id] = {
						scryfallId: card.id,
						count: card.count,
						meta: card.meta,
						rowIds: newRowIds,
					};
				}
				for (const rowId of newRowIds) {
					toInsert.push({ rowId, scryfallId: card.id, meta: card.meta });
				}
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
		(cardId: string): number => {
			return collection[cardId]?.count ?? 0;
		},
		[collection]
	);

	const entries = useMemo(() => Object.values(collection), [collection]);

	return {
		collection,
		entries,
		isLoaded,
		addCard,
		removeCard,
		decrementCard,
		updateEntry,
		changePrint,
		getQuantity,
		clearCollection,
		importCards,
	};
}
