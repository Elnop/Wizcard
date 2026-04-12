'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import { getCardsFromCache, putCardsInCache } from '@/lib/scryfall/utils/card-cache';
import type { Card, CardStack } from '@/types/cards';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

type StoredCopy = { scryfallId: string; entry: CardEntry };

function groupByOracleId(cards: Card[]): CardStack[] {
	const map = new Map<string, Card[]>();
	for (const card of cards) {
		const key = card.oracle_id;
		const existing = map.get(key);
		if (existing) {
			existing.push(card);
		} else {
			map.set(key, [card]);
		}
	}
	return Array.from(map.entries()).map(([oracleId, cards]) => ({
		oracleId,
		name: cards[0].name,
		cards,
	}));
}

function buildCards(entries: StoredCopy[], scryfallMap: Map<string, ScryfallCard>): Card[] {
	const result: Card[] = [];
	for (const copy of entries) {
		const scryfallCard = scryfallMap.get(copy.scryfallId);
		if (scryfallCard) {
			result.push({ ...scryfallCard, entry: copy.entry });
		}
	}
	return result;
}

export function useCollectionCards(entries: StoredCopy[]): {
	stacks: CardStack[];
	isLoading: boolean;
	totalExpected: number;
} {
	// scryfallMap is the source of truth for hydrated Scryfall data
	const scryfallMapRef = useRef<Map<string, ScryfallCard>>(new Map());
	const [scryfallMap, setScryfallMap] = useState<Map<string, ScryfallCard>>(new Map());
	const [isLoading, setIsLoading] = useState(false);

	// Only re-fetch when the set of unique scryfallIds changes
	const idsKey = useMemo(
		() => [...new Set(entries.map((e) => e.scryfallId))].sort().join(','),
		[entries]
	);

	useEffect(() => {
		if (entries.length === 0) {
			scryfallMapRef.current = new Map();
			setScryfallMap(new Map());
			setIsLoading(false);
			return;
		}

		const cancelledRef = { current: false };
		setIsLoading(true);

		async function hydrate() {
			const uniqueIds = [...new Set(entries.map((e) => e.scryfallId))];

			// Phase 1: read from IndexedDB cache
			const cachedMap = await getCardsFromCache(uniqueIds);
			if (cancelledRef.current) return;

			const missIds = uniqueIds.filter((id) => !cachedMap.has(id));

			// Merge cache hits into the running map and publish
			const merged = new Map([...scryfallMapRef.current, ...cachedMap]);

			if (missIds.length === 0) {
				if (!cancelledRef.current) {
					scryfallMapRef.current = merged;
					setScryfallMap(merged);
					setIsLoading(false);
				}
				return;
			}

			// Publish cache hits immediately so the UI can show them while we fetch
			if (cachedMap.size > 0 && !cancelledRef.current) {
				scryfallMapRef.current = merged;
				setScryfallMap(merged);
			}

			// Phase 2: fetch only the cache misses from the network
			const identifiers = missIds.map((id) => ({ id }));
			const chunks: (typeof identifiers)[] = [];
			for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
				chunks.push(identifiers.slice(i, i + BATCH_SIZE));
			}

			const fetchedScryfallCards: ScryfallCard[] = [];
			for (let i = 0; i < chunks.length; i++) {
				if (cancelledRef.current) return;
				try {
					const result = await getCardCollection(chunks[i]);
					for (const scryfallCard of result.data) {
						fetchedScryfallCards.push(scryfallCard);
					}
				} catch (err) {
					console.error(`[useCollectionCards] batch ${i + 1}/${chunks.length} failed:`, err);
				}
			}

			void putCardsInCache(fetchedScryfallCards);

			const fetchedMap = new Map(fetchedScryfallCards.map((c) => [c.id, c]));
			const allMap = new Map([...merged, ...fetchedMap]);

			if (!cancelledRef.current) {
				scryfallMapRef.current = allMap;
				setScryfallMap(allMap);
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

	// Re-derive cards whenever entries OR the scryfallMap changes
	const cards = useMemo(() => buildCards(entries, scryfallMap), [entries, scryfallMap]);

	const stacks = useMemo(() => groupByOracleId(cards), [cards]);

	return { stacks, isLoading, totalExpected: entries.length };
}
