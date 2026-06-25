'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import type { Card, CardStack } from '@/types/cards';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { groupByOracleId } from '@/lib/card/utils/group-cards';

type StoredCopy = { scryfallId: string; entry: CardEntry };

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

			// Only process IDs we haven't already hydrated. This keeps scryfallMap
			// monotonically growing across re-runs (entries arrive page by page from
			// Supabase) instead of re-reading/re-fetching everything each time.
			const pendingIds = uniqueIds.filter((id) => !scryfallMapRef.current.has(id));

			if (pendingIds.length === 0) {
				if (!cancelledRef.current) setIsLoading(false);
				return;
			}

			// Resolve pending IDs (IndexedDB cache → network for misses → cache write)
			const resolvedMap = await resolveCardsByScryfallIds(pendingIds, {
				isCancelled: () => cancelledRef.current,
			});
			if (cancelledRef.current) return;

			// Merge into the running map (monotonic growth across paged re-runs)
			const allMap = new Map([...scryfallMapRef.current, ...resolvedMap]);

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
