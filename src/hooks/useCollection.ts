'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card, CollectionStats } from '@/types/card';
import { toStoredCard } from '@/types/card';

const STORAGE_KEY = 'mtg-snap-collection';

type CollectionData = Record<string, Card>;

const EMPTY: CollectionData = {};
let listeners: Array<() => void> = [];
let cachedSnapshot: CollectionData | null = null;

// Migrate legacy entries that stored { card: ScryfallCard, quantity, dateAdded }
// to the flat Card shape where card data is top-level.
function migrateEntry(raw: unknown): Card {
	if (
		raw &&
		typeof raw === 'object' &&
		'card' in raw &&
		typeof (raw as Record<string, unknown>).card === 'object'
	) {
		const legacy = raw as { card: ScryfallCard; quantity: number; dateAdded: string };
		return { ...legacy.card, quantity: legacy.quantity, dateAdded: legacy.dateAdded };
	}
	return raw as Card;
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
			const card = migrateEntry(entry);
			migrated[id] = card;
			if (entry !== card) needsWrite = true;
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
				...toStoredCard(card),
				quantity: existing ? (existing.quantity ?? 0) + 1 : 1,
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
		if ((existing.quantity ?? 0) <= 1) {
			const next = { ...current };
			delete next[cardId];
			saveCollection(next);
		} else {
			saveCollection({
				...current,
				[cardId]: { ...existing, quantity: (existing.quantity ?? 0) - 1 },
			});
		}
	}, []);

	const getQuantity = useCallback(
		(cardId: string): number => {
			return collection[cardId]?.quantity ?? 0;
		},
		[collection]
	);

	const getStats = useCallback((): CollectionStats => {
		const entries = Object.values(collection);
		const sets = new Set<string>();
		const rarityDistribution: Record<string, number> = {};
		let totalCards = 0;

		for (const entry of entries) {
			const qty = entry.quantity ?? 0;
			totalCards += qty;
			sets.add(entry.set);
			const rarity = entry.rarity;
			rarityDistribution[rarity] = (rarityDistribution[rarity] ?? 0) + qty;
		}

		return {
			totalCards,
			uniqueCards: entries.length,
			uniqueByEdition: entries.length,
			setCount: sets.size,
			rarityDistribution,
		};
	}, [collection]);

	const clearCollection = useCallback(() => {
		saveCollection({});
	}, []);

	const importCards = useCallback(
		(
			cards: Array<
				ScryfallCard & { quantity: number; isFoil?: boolean; condition?: string; tags?: string[] }
			>
		) => {
			const current = getSnapshot();
			const next = { ...current };
			for (const card of cards) {
				const existing = next[card.id];
				next[card.id] = {
					...toStoredCard(card),
					quantity: (existing?.quantity ?? 0) + card.quantity,
					isFoil: card.isFoil,
					condition: card.condition,
					tags: card.tags,
					dateAdded: existing?.dateAdded ?? new Date().toISOString(),
				};
			}
			saveCollection(next);
		},
		[]
	);

	const entries = Object.values(collection);

	return {
		collection,
		entries,
		isLoaded: true,
		addCard,
		removeCard,
		decrementCard,
		getQuantity,
		getStats,
		clearCollection,
		importCards,
	};
}
