'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckMeta, DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { fetchDeckMetaById, fetchDeckCards } from '@/lib/deck/db/decks';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { computeDeckStats, type DeckStats } from '@/lib/deck/utils/deck-stats';
import { pickCoverArt } from '@/lib/deck/utils/pick-cover-art';
import type { ResolvedDeckCard } from './useDeckDetail';

type DeckCard = { scryfallId: string; entry: CardEntry };

/**
 * Read-only, context-free counterpart of {@link useDeckDetail}. Loads a deck and
 * its cards directly from the DB by id (no owner filter, relies on the public
 * SELECT policy) so a non-owner / anonymous visitor can view any deck. Produces
 * the same shape as useDeckDetail for reuse by the read-only deck view.
 */
export function usePublicDeckDetail(deckId: string) {
	const [deck, setDeck] = useState<DeckMeta | null>(null);
	const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
	const [scryfallCards, setScryfallCards] = useState<Record<string, ScryfallCard>>({});
	const resolvedIdsRef = useRef<Set<string>>(new Set());
	const [resolveGeneration, setResolveGeneration] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const activeResolveRef = useRef(0);

	// Load deck meta + cards from DB
	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			try {
				const [meta, cards] = await Promise.all([
					fetchDeckMetaById(deckId),
					fetchDeckCards(deckId),
				]);
				if (cancelled) return;
				setDeck(meta);
				setDeckCards(cards);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [deckId]);

	// Resolve Scryfall data for all unique scryfall IDs
	useEffect(() => {
		const uniqueIds = [...new Set(deckCards.map((e) => e.scryfallId))];
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
	}, [deckCards]);

	// Build resolved cards list
	const resolvedCards: ResolvedDeckCard[] = useMemo(() => {
		return deckCards
			.slice()
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
	}, [deckCards, scryfallCards]);

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

	const coverArtUrl = useMemo(
		() =>
			pickCoverArt(resolvedCards.map((rc) => ({ card: rc as ScryfallCard, tags: rc.entry.tags }))),
		[resolvedCards]
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
