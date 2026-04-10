'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { computeDeckStats, type DeckStats } from '@/lib/deck/utils/deck-stats';

export type ResolvedDeckCard = {
	card: ScryfallCard;
	entry: CardEntry;
	zone: DeckZone;
};

export function useDeckDetail(deckId: string) {
	const { decks, activeDeckId, activeDeckCards, loadDeck } = useDeckContext();

	const [scryfallCards, setScryfallCards] = useState<Record<string, ScryfallCard>>({});
	const resolvedIdsRef = useRef<Set<string>>(new Set());
	const [resolveGeneration, setResolveGeneration] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const activeResolveRef = useRef(0);

	const deck = decks.find((d) => d.id === deckId) ?? null;

	// Load deck cards from DB
	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		loadDeck(deckId).finally(() => {
			if (!cancelled) setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [deckId, loadDeck]);

	// Resolve Scryfall data for all unique scryfall IDs
	useEffect(() => {
		if (activeDeckId !== deckId) return;

		const entries = Object.values(activeDeckCards);
		const uniqueIds = [...new Set(entries.map((e) => e.scryfallId))];

		// Filter out already resolved IDs
		const toResolve = uniqueIds.filter((id) => !resolvedIdsRef.current.has(id));
		if (toResolve.length === 0) return;

		const generation = ++activeResolveRef.current;
		const capturedGeneration = generation;
		setResolveGeneration(generation);

		async function resolve() {
			const resolved: Record<string, ScryfallCard> = {};
			// Batch in groups of 75 (Scryfall limit)
			for (let i = 0; i < toResolve.length; i += 75) {
				if (activeResolveRef.current !== capturedGeneration) return;
				const batch = toResolve.slice(i, i + 75);
				const identifiers = batch.map((id) => ({ id }));
				try {
					const result = await getCardCollection(identifiers);
					for (const card of result.data) {
						resolved[card.id] = card;
					}
				} catch (err) {
					console.error('[useDeckDetail] Failed to resolve cards:', err);
				}
			}
			if (activeResolveRef.current === capturedGeneration) {
				for (const id of Object.keys(resolved)) {
					resolvedIdsRef.current.add(id);
				}
				setScryfallCards((prev) => ({ ...prev, ...resolved }));
				setResolveGeneration(0);
			}
		}

		void resolve();
		return () => {
			if (activeResolveRef.current === capturedGeneration) {
				// eslint-disable-next-line react-hooks/exhaustive-deps -- activeResolveRef is a generation counter, not a DOM ref
				activeResolveRef.current++;
			}
		};
	}, [activeDeckId, deckId, activeDeckCards]);

	// Build resolved cards list
	const resolvedCards: ResolvedDeckCard[] = useMemo(() => {
		if (activeDeckId !== deckId) return [];
		return Object.values(activeDeckCards)
			.map((copy) => {
				const card = scryfallCards[copy.scryfallId];
				if (!card) return null;
				return {
					card,
					entry: copy.entry,
					zone: getDeckZone(copy.entry.tags),
				};
			})
			.filter((c): c is ResolvedDeckCard => c !== null);
	}, [activeDeckId, deckId, activeDeckCards, scryfallCards]);

	// Group by zone
	const cardsByZone = useMemo(() => {
		const grouped: Record<DeckZone, ResolvedDeckCard[]> = {
			mainboard: [],
			sideboard: [],
			maybeboard: [],
			commander: [],
		};
		for (const rc of resolvedCards) {
			grouped[rc.zone].push(rc);
		}
		return grouped;
	}, [resolvedCards]);

	// Compute stats
	const stats: DeckStats = useMemo(() => {
		return computeDeckStats(resolvedCards.map((rc) => ({ card: rc.card, zone: rc.zone })));
	}, [resolvedCards]);

	const isResolving = resolveGeneration > 0;

	return {
		deck,
		cardsByZone,
		resolvedCards,
		stats,
		isLoading,
		isResolving,
	};
}
