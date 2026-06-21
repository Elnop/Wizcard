'use client';

import { useEffect, useState } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { searchAllCards } from '@/lib/scryfall/endpoints/cards';
import { buildScryfallQuery } from '@/lib/scryfall/utils/scryfall-query';

interface UseSetCardsCompleteResult {
	cards: ScryfallCard[];
	isLoading: boolean;
	error: Error | null;
}

/**
 * Fetches every card of a set (all pages, not just the first) so set completion
 * can be computed against the full print list. Only runs when `enabled` is true,
 * so the simple grid view never pays this cost.
 */
export function useSetCardsComplete(setCode: string, enabled: boolean): UseSetCardsCompleteResult {
	const [cards, setCards] = useState<ScryfallCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (!enabled || !setCode) return;

		let cancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);
			try {
				const query = buildScryfallQuery({ set: setCode });
				const all = await searchAllCards({ q: query, order: 'set', dir: 'asc' });
				if (!cancelled) setCards(all);
			} catch (err: unknown) {
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error('Failed to load set cards'));
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [setCode, enabled]);

	return { cards, isLoading, error };
}
