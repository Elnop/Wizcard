'use client';

import { create } from 'zustand';
import type { Card } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';

/** Anything the mirror can hold: a domain print or an MPC custom card. */
type StoredCard = Card | CustomCard;

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
	cards: Map<string, StoredCard>;
	putCards: (cards: StoredCard[]) => void;
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
export function getCard(scryfallId: string): StoredCard | undefined {
	return useCardsStore.getState().cards.get(scryfallId);
}

export function getOracleId(scryfallId: string): string | undefined {
	return getCard(scryfallId)?.oracle_id;
}

export function putCards(cards: StoredCard[]): void {
	useCardsStore.getState().putCards(cards);
}
