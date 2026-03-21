'use client';

import { useState, useEffect, useMemo } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { getCardsFromCache, putCardsInCache } from '@/lib/card-cache';
import type { Card, CardStack } from '@/types/cards';
import type { CardEntry } from '@/types/cards';

const BATCH_SIZE = 75;

type StoredCopy = { scryfallId: string; entry: CardEntry };

function groupByName(cards: Card[]): CardStack[] {
	const map = new Map<string, Card[]>();
	for (const card of cards) {
		const existing = map.get(card.name);
		if (existing) {
			existing.push(card);
		} else {
			map.set(card.name, [card]);
		}
	}
	return Array.from(map.entries()).map(([name, cards]) => ({ name, cards }));
}

export function useCollectionCards(entries: StoredCopy[]): {
	stacks: CardStack[];
	isLoading: boolean;
	totalExpected: number;
} {
	const [cards, setCards] = useState<Card[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Stable key representing the current set of scryfallIds — only re-fetch on actual changes
	const idsKey = useMemo(
		() => [...new Set(entries.map((e) => e.scryfallId))].sort().join(','),
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
			// Unique scryfallIds to fetch
			const uniqueIds = [...new Set(entries.map((e) => e.scryfallId))];

			// Phase 1: read from IndexedDB cache (~20-50ms)
			const cachedMap = await getCardsFromCache(uniqueIds);
			if (cancelledRef.current) return;

			const missIds = uniqueIds.filter((id) => !cachedMap.has(id));

			// Build Card[] from cache hits — one Card per physical copy
			function buildCards(
				scryfallMap: Map<string, import('@/lib/scryfall/types/scryfall').ScryfallCard>
			): Card[] {
				const result: Card[] = [];
				for (const copy of entries) {
					const scryfallCard = scryfallMap.get(copy.scryfallId);
					if (scryfallCard) {
						result.push({ ...scryfallCard, entry: copy.entry });
					}
				}
				return result;
			}

			const cachedCards = buildCards(cachedMap);

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

			const settled = await Promise.allSettled(chunks.map((chunk) => getCardCollection(chunk)));
			if (cancelledRef.current) return;

			const fetchedScryfallCards: import('@/lib/scryfall/types/scryfall').ScryfallCard[] = [];
			for (const result of settled) {
				if (result.status === 'rejected') {
					console.error('[useCollectionCards] batch failed:', result.reason);
					continue;
				}
				for (const scryfallCard of result.value.data) {
					fetchedScryfallCards.push(scryfallCard);
				}
			}

			void putCardsInCache(fetchedScryfallCards);

			const fetchedMap = new Map(fetchedScryfallCards.map((c) => [c.id, c]));
			const allMap = new Map([...cachedMap, ...fetchedMap]);
			const mergedCards = buildCards(allMap);

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

	const stacks = useMemo(() => groupByName(cards), [cards]);

	return { stacks, isLoading, totalExpected: entries.length };
}
