'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * Best-effort in-memory mirror of hydrated Scryfall cards, keyed by print id.
 * Populated passively wherever cards are resolved (see `resolveCardsByScryfallIds`),
 * so any consumer can look a card (or its oracle_id) up synchronously and globally
 * — without re-reading the async IndexedDB cache.
 *
 * NOT persisted: the IndexedDB card cache (with its TTL) stays the source of
 * truth; this is just a hot, synchronous read layer.
 */
type CardsStoreState = {
	cards: Map<string, ScryfallCard>;
	putCards: (cards: ScryfallCard[]) => void;
};

export const useCardsStore = create<CardsStoreState>((set, get) => ({
	cards: new Map(),
	putCards: (cards) => {
		if (cards.length === 0) return;
		const next = new Map(get().cards);
		for (const card of cards) next.set(card.id, card);
		set({ cards: next });
	},
}));

/** Synchronous, non-React accessors over the global cards store. */
export function getCard(scryfallId: string): ScryfallCard | undefined {
	return useCardsStore.getState().cards.get(scryfallId);
}

export function getOracleId(scryfallId: string): string | undefined {
	return getCard(scryfallId)?.oracle_id;
}

export function putCards(cards: ScryfallCard[]): void {
	useCardsStore.getState().putCards(cards);
}
