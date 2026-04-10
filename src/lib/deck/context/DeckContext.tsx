'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta, DeckZone } from '@/types/decks';
import type { CardEntry } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { useDeckStore } from '../store/deck-store';

type StoredCopy = { scryfallId: string; entry: CardEntry };

type DeckContextValue = {
	decks: DeckMeta[];
	activeDeckId: string | null;
	activeDeckCards: Record<string, StoredCopy>;
	isLoaded: boolean;

	createDeck: (name: string, format: DeckMeta['format'], description: string | null) => string;
	updateDeck: (
		deckId: string,
		updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>
	) => void;
	deleteDeck: (deckId: string) => void;

	loadDeck: (deckId: string) => Promise<void>;
	addCardToDeck: (deckId: string, card: ScryfallCard, zone: DeckZone) => void;
	bulkAddCardsToDeck: (
		deckId: string,
		cards: Array<{ card: ScryfallCard; zone: DeckZone; quantity: number }>
	) => void;
	removeCardFromDeck: (rowId: string) => void;
	changeZone: (rowId: string, zone: DeckZone) => void;
	updateDeckCard: (rowId: string, updates: { tags?: string[]; owner_id?: string | null }) => void;
	toggleOwned: (rowId: string) => void;
};

const DeckContext = createContext<DeckContextValue | null>(null);

export function DeckProvider({ children }: { children: React.ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const userId = user?.id ?? null;

	const store = useDeckStore();
	const prevUserIdRef = useRef<string | null | undefined>(undefined);

	useEffect(() => {
		if (authLoading) return;

		const prevUserId = prevUserIdRef.current;
		prevUserIdRef.current = userId;

		if (!userId) {
			store.handleLogout();
			return;
		}

		if (prevUserId !== undefined && prevUserId !== null && prevUserId !== userId) {
			useDeckStore.setState({
				decks: {},
				activeDeckId: null,
				activeDeckCards: {},
				isLoaded: false,
			});
		}

		void store.hydrateDecks(userId);
	}, [userId, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

	const createDeck = useCallback(
		(name: string, format: DeckMeta['format'], description: string | null) => {
			if (!userId) throw new Error('Must be logged in to create a deck');
			return store.createDeck(name, format, description, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const updateDeck = useCallback(
		(deckId: string, updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>) => {
			if (!userId) return;
			store.updateDeck(deckId, updates, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const deleteDeck = useCallback(
		(deckId: string) => {
			if (!userId) return;
			store.deleteDeck(deckId, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const loadDeck = useCallback(async (deckId: string) => {
		await useDeckStore.getState().hydrateActiveDeck(deckId);
	}, []);

	const addCardToDeck = useCallback(
		(deckId: string, card: ScryfallCard, zone: DeckZone) => {
			if (!userId) return;
			store.addCardToDeck(deckId, card, zone, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const bulkAddCardsToDeck = useCallback(
		(deckId: string, cards: Array<{ card: ScryfallCard; zone: DeckZone; quantity: number }>) => {
			if (!userId) return;
			store.bulkAddCardsToDeck(deckId, cards, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const removeCardFromDeck = useCallback(
		(rowId: string) => store.removeCardFromDeck(rowId, triggerSync),
		[store, triggerSync]
	);

	const changeZone = useCallback(
		(rowId: string, zone: DeckZone) => store.changeZone(rowId, zone, triggerSync),
		[store, triggerSync]
	);

	const updateDeckCard = useCallback(
		(rowId: string, updates: { tags?: string[]; owner_id?: string | null }) =>
			store.updateDeckCard(rowId, updates, triggerSync),
		[store, triggerSync]
	);

	const toggleOwned = useCallback(
		(rowId: string) => {
			if (!userId) return;
			store.toggleOwned(rowId, userId, triggerSync);
		},
		[store, userId, triggerSync]
	);

	const decks = useMemo(() => Object.values(store.decks), [store.decks]);

	const value: DeckContextValue = {
		decks,
		activeDeckId: store.activeDeckId,
		activeDeckCards: store.activeDeckCards,
		isLoaded: store.isLoaded,
		createDeck,
		updateDeck,
		deleteDeck,
		loadDeck,
		addCardToDeck,
		bulkAddCardsToDeck,
		removeCardFromDeck,
		changeZone,
		updateDeckCard,
		toggleOwned,
	};

	return <DeckContext value={value}>{children}</DeckContext>;
}

export function useDeckContext(): DeckContextValue {
	const ctx = useContext(DeckContext);
	if (!ctx) throw new Error('useDeckContext must be used within a DeckProvider');
	return ctx;
}
