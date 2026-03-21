'use client';

import { useState, useEffect, useMemo } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { getCardsFromCache, putCardsInCache } from '@/lib/card-cache';
import type { CollectionStack, Card } from '@/types/card';

const BATCH_SIZE = 75;

export function useCollectionCards(entries: CollectionStack[]): {
	cards: Card[];
	isLoading: boolean;
	totalExpected: number;
} {
	const [cards, setCards] = useState<Card[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Stable key representing the current set of IDs — only re-fetch on actual ID changes
	const idsKey = useMemo(
		() =>
			entries
				.map((e) => e.scryfallId)
				.sort()
				.join(','),
		[entries]
	);

	useEffect(() => {
		if (entries.length === 0) {
			setCards([]);
			setIsLoading(false);
			return;
		}

		const cancelledRef = { current: false };
		setIsLoading(true);

		async function hydrate() {
			// Build a lookup map from scryfallId → CollectionStack for fast merge
			const entryMap = new Map<string, CollectionStack>();
			for (const entry of entries) {
				entryMap.set(entry.scryfallId, entry);
			}

			const allIds = entries.map((e) => e.scryfallId);

			// Phase 1: read from IndexedDB cache (~20-50ms)
			const cachedMap = await getCardsFromCache(allIds);
			if (cancelledRef.current) return;

			const missIds = allIds.filter((id) => !cachedMap.has(id));

			// Build cards from cache hits
			const cachedCards: Card[] = [];
			for (const [id, scryfallCard] of cachedMap) {
				const stack = entryMap.get(id);
				if (stack) cachedCards.push({ ...scryfallCard, ...stack, ...stack.meta });
			}

			// If everything is cached, we're done
			if (missIds.length === 0) {
				if (!cancelledRef.current) {
					setCards(cachedCards);
					setIsLoading(false);
				}
				return;
			}

			// Show cached cards immediately while fetching the rest
			if (cachedCards.length > 0 && !cancelledRef.current) {
				setCards(cachedCards);
			}

			// Phase 2: fetch only the cache misses from the network
			const identifiers = missIds.map((id) => ({ id }));
			const chunks: (typeof identifiers)[] = [];
			for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
				chunks.push(identifiers.slice(i, i + BATCH_SIZE));
			}

			// Launch all batches concurrently — they self-sequence via the rate-limiter
			const settled = await Promise.allSettled(chunks.map((chunk) => getCardCollection(chunk)));
			if (cancelledRef.current) return;

			const fetchedScryfallCards = [];
			for (const result of settled) {
				if (result.status === 'rejected') {
					console.error('[useCollectionCards] batch failed:', result.reason);
					continue;
				}
				for (const scryfallCard of result.value.data) {
					fetchedScryfallCards.push(scryfallCard);
				}
			}

			// Persist new cards to the cache (fire-and-forget)
			void putCardsInCache(fetchedScryfallCards);

			const fetchedCards: Card[] = [];
			for (const scryfallCard of fetchedScryfallCards) {
				const stack = entryMap.get(scryfallCard.id);
				if (stack) fetchedCards.push({ ...scryfallCard, ...stack, ...stack.meta });
			}

			const mergedCards = [...cachedCards, ...fetchedCards];
			if (!cancelledRef.current) {
				setCards(mergedCards);
				setIsLoading(false);
			}
		}

		hydrate().catch((err) => {
			if (!cancelledRef.current) {
				console.error('[useCollectionCards] hydration failed:', err);
				setIsLoading(false);
			}
		});

		return () => {
			cancelledRef.current = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idsKey]);

	return { cards, isLoading, totalExpected: entries.length };
}
