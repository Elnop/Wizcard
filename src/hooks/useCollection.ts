'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CollectionEntry } from '@/types/card';

const STORAGE_KEY = 'mtg-snap-collection';

type CollectionData = Record<string, CollectionEntry>;

const EMPTY: CollectionData = {};
let listeners: Array<() => void> = [];
let cachedSnapshot: CollectionData | null = null;

// Migrate legacy entries to slim CollectionEntry shape
function migrateEntry(raw: unknown): CollectionEntry {
	if (
		raw &&
		typeof raw === 'object' &&
		'card' in raw &&
		typeof (raw as Record<string, unknown>).card === 'object'
	) {
		// Legacy format 1: { card: ScryfallCard, quantity, dateAdded }
		const legacy = raw as { card: { id: string }; quantity: number; dateAdded: string };
		return {
			id: legacy.card.id,
			quantity: legacy.quantity ?? 1,
			dateAdded: legacy.dateAdded ?? new Date().toISOString(),
		};
	}
	// Legacy format 2: StoredCard (flat) — keep only CollectionEntry fields, discard Scryfall data
	const flat = raw as Record<string, unknown>;
	return {
		id: flat.id as string,
		quantity: (flat.quantity as number) ?? 1,
		dateAdded: (flat.dateAdded as string) ?? new Date().toISOString(),
		isFoil: flat.isFoil as boolean | undefined,
		foilType: flat.foilType as 'foil' | 'etched' | undefined,
		condition: flat.condition as string | undefined,
		language: flat.language as string | undefined,
		tags: flat.tags as string[] | undefined,
		purchasePrice: flat.purchasePrice as string | undefined,
		tradelistCount: flat.tradelistCount as number | undefined,
		alter: flat.alter as boolean | undefined,
		proxy: flat.proxy as boolean | undefined,
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
		for (const [id, entry] of Object.entries(parsed)) {
			const migratedEntry = migrateEntry(entry);
			migrated[id] = migratedEntry;
			// Detect if migration changed the entry (legacy format detected)
			if (
				entry !== migratedEntry &&
				typeof entry === 'object' &&
				entry !== null &&
				('card' in (entry as object) || 'name' in (entry as object))
			) {
				needsWrite = true;
			}
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
	}
	emitChange();
}

export function useCollection() {
	const collection = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const addCard = useCallback((card: ScryfallCard) => {
		const current = getSnapshot();
		const existing = current[card.id];
		saveCollection({
			...current,
			[card.id]: {
				id: card.id,
				quantity: existing ? existing.quantity + 1 : 1,
				dateAdded: existing?.dateAdded ?? new Date().toISOString(),
			},
		});
	}, []);

	const removeCard = useCallback((cardId: string) => {
		const current = getSnapshot();
		const next = { ...current };
		delete next[cardId];
		saveCollection(next);
	}, []);

	const decrementCard = useCallback((cardId: string) => {
		const current = getSnapshot();
		const existing = current[cardId];
		if (!existing) return;
		if (existing.quantity <= 1) {
			const next = { ...current };
			delete next[cardId];
			saveCollection(next);
		} else {
			saveCollection({
				...current,
				[cardId]: { ...existing, quantity: existing.quantity - 1 },
			});
		}
	}, []);

	const getQuantity = useCallback(
		(cardId: string): number => {
			return collection[cardId]?.quantity ?? 0;
		},
		[collection]
	);

	const updateEntry = useCallback((cardId: string, updates: Partial<CollectionEntry>) => {
		const current = getSnapshot();
		if (!current[cardId]) return;
		saveCollection({
			...current,
			[cardId]: { ...current[cardId], ...updates },
		});
	}, []);

	const changePrint = useCallback((oldCardId: string, newCardId: string) => {
		const current = getSnapshot();
		const existing = current[oldCardId];
		if (!existing) return;
		const next = { ...current };
		delete next[oldCardId];
		next[newCardId] = { ...existing, id: newCardId };
		saveCollection(next);
	}, []);

	const clearCollection = useCallback(() => {
		saveCollection({});
	}, []);

	const importCards = useCallback((cards: Array<ScryfallCard & CollectionEntry>) => {
		const current = getSnapshot();
		const next = { ...current };
		for (const card of cards) {
			const existing = next[card.id];
			next[card.id] = {
				id: card.id,
				quantity: (existing?.quantity ?? 0) + card.quantity,
				foilType: card.foilType,
				isFoil: card.isFoil,
				condition: card.condition,
				language: card.language,
				purchasePrice: card.purchasePrice,
				tradelistCount: card.tradelistCount,
				alter: card.alter,
				proxy: card.proxy,
				tags: card.tags,
				dateAdded: existing?.dateAdded ?? new Date().toISOString(),
			};
		}
		saveCollection(next);
	}, []);

	const entries = Object.values(collection);

	return {
		collection,
		entries,
		isLoaded: true,
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
