'use client';

import { create } from 'zustand';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { DeckMeta, DeckZone } from '@/types/decks';
import { setDeckZone } from '@/types/decks';
import { fetchDecks, fetchDeckCards } from '../db/decks';
import { enqueue } from '@/lib/supabase/sync-queue';

type StoredCopy = { scryfallId: string; entry: CardEntry };

type DeckState = {
	decks: Record<string, DeckMeta>;
	activeDeckId: string | null;
	activeDeckCards: Record<string, StoredCopy>;
	isLoaded: boolean;
};

type DeckActions = {
	hydrateDecks: (userId: string) => Promise<void>;
	hydrateActiveDeck: (deckId: string) => Promise<void>;
	handleLogout: () => void;

	createDeck: (
		name: string,
		format: DeckMeta['format'],
		description: string | null,
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
	activeDeckId: null,
	activeDeckCards: {},
	isLoaded: false,

	hydrateDecks: async (userId) => {
		const deckList = await fetchDecks(userId);
		const decks: Record<string, DeckMeta> = {};
		for (const deck of deckList) decks[deck.id] = deck;
		set({ decks, isLoaded: true });
	},

	hydrateActiveDeck: async (deckId) => {
		const rows = await fetchDeckCards(deckId);
		const cards: Record<string, StoredCopy> = {};
		for (const row of rows) cards[row.entry.rowId] = row;
		set({ activeDeckId: deckId, activeDeckCards: cards });
	},

	handleLogout: () => {
		set({ decks: {}, activeDeckId: null, activeDeckCards: {}, isLoaded: false });
	},

	createDeck: (name, format, description, userId, triggerSync) => {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const deck: DeckMeta = { id, name, format, description, createdAt: now, updatedAt: now };
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
