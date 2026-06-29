'use client';

import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { useCardsStore, getCard } from '@/lib/scryfall/store/cards-store';
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
	const [isLoading, setIsLoading] = useState(false);

	const ids = useMemo(() => [...new Set(entries.map((e) => e.scryfallId))], [entries]);
	const idsKey = useMemo(() => [...ids].sort().join(','), [ids]);

	// Hydrated cards come from the GLOBAL store, not a per-hook map. The selector
	// is scoped to our own scryfallIds, so we only re-render when a card WE care
	// about appears — never when an unrelated card (e.g. from search) is added.
	// `useShallow` compares the derived Map by entries (zustand v5), avoiding the
	// new-reference-every-render re-render loop.
	const scryfallMap = useCardsStore(
		useShallow((s) => {
			const m = new Map<string, ScryfallCard>();
			for (const id of ids) {
				const card = s.cards.get(id);
				if (card) m.set(id, card);
			}
			return m;
		})
	);

	// The effect only TRIGGERS resolution of ids missing from the global store;
	// `resolveCardsByScryfallIds` writes them into the store (cache + network),
	// which re-renders us via the selector above. No local map, no merge, no loop.
	useEffect(() => {
		if (ids.length === 0) {
			setIsLoading(false);
			return;
		}

		const pendingIds = ids.filter((id) => !getCard(id));
		if (pendingIds.length === 0) {
			setIsLoading(false);
			return;
		}

		const cancelled = { current: false };
		setIsLoading(true);

		resolveCardsByScryfallIds(pendingIds, { isCancelled: () => cancelled.current })
			.then(() => {
				if (!cancelled.current) setIsLoading(false);
			})
			.catch((err) => {
				if (!cancelled.current) {
					console.error('[useCollectionCards] hydration failed:', err);
					setIsLoading(false);
				}
			});

		return () => {
			cancelled.current = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [idsKey]);

	const cards = useMemo(() => buildCards(entries, scryfallMap), [entries, scryfallMap]);
	const stacks = useMemo(() => groupByOracleId(cards), [cards]);

	return { stacks, isLoading, totalExpected: entries.length };
}
