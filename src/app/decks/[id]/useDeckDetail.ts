'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { Card } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { computeDeckStats, type DeckStats } from '@/lib/deck/utils/deck-stats';
import { pickCoverArt } from '@/lib/deck/utils/pick-cover-art';

export type ResolvedDeckCard = Card;

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
			const resolvedMap = await resolveCardsByScryfallIds(toResolve, {
				isCancelled: () => activeResolveRef.current !== capturedGeneration,
			});
			if (activeResolveRef.current === capturedGeneration) {
				const resolved = Object.fromEntries(resolvedMap);
				for (const id of resolvedMap.keys()) {
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
			.sort((a, b) => {
				const da = a.entry.dateAdded ?? '';
				const db = b.entry.dateAdded ?? '';
				if (da < db) return -1;
				if (da > db) return 1;
				return 0;
			})
			.map((copy): ResolvedDeckCard | null => {
				const card = scryfallCards[copy.scryfallId];
				if (!card) return null;
				return { ...card, entry: copy.entry };
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
			tokens: [],
		};
		for (const rc of resolvedCards) {
			grouped[getDeckZone(rc.entry.tags)].push(rc);
		}
		return grouped;
	}, [resolvedCards]);

	// Compute stats
	const stats: DeckStats = useMemo(() => {
		return computeDeckStats(
			resolvedCards
				.filter((rc) => getDeckZone(rc.entry.tags) !== 'tokens')
				.map((rc) => ({ card: rc as ScryfallCard, zone: getDeckZone(rc.entry.tags) }))
		);
	}, [resolvedCards]);

	// Cover art for the page background: user-chosen cover wins, else auto
	// (commander > non-land > any).
	const coverArtUrl = useMemo(
		() =>
			deck?.coverArtUrl ??
			pickCoverArt(resolvedCards.map((rc) => ({ card: rc as ScryfallCard, tags: rc.entry.tags }))),
		[deck?.coverArtUrl, resolvedCards]
	);

	const isResolving = resolveGeneration > 0;

	return {
		deck,
		cardsByZone,
		resolvedCards,
		stats,
		coverArtUrl,
		isLoading,
		isResolving,
	};
}
