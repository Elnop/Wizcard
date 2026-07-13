'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { searchAllCards } from '@/lib/scryfall/endpoints/cards';
import type { SetGroup } from '@/lib/scryfall/utils/set-classification';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { computeSetCompletion, type SetCompletion } from '../../utils/setCompletion';

export interface UseGroupCompletionResult {
	/** All cards of every set in the group, once loaded. */
	allCards: ScryfallCard[];
	/** Cards of the currently active set tab only. */
	activeCards: ScryfallCard[];
	/** Completion aggregated over the whole group (all sub-sets). */
	groupCompletion: SetCompletion;
	/** Completion of the active set tab only. */
	activeCompletion: SetCompletion;
	isLoading: boolean;
	error: Error | null;
	/** True when the user's collection is not fully hydrated (completion may be understated). */
	isPartialCollection: boolean;
}

/**
 * Fetches every print of every set in the group with a single combined Scryfall
 * query, then derives both the group-wide completion and the active-tab
 * completion from the same card list (no double-fetch). Cross-references against
 * the user's collection.
 */
export function useGroupCompletion(group: SetGroup, activeCode: string): UseGroupCompletionResult {
	const { getOwnership, isFullyLoaded } = useCollectionContext();
	const [allCards, setAllCards] = useState<ScryfallCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Stable key of all set codes in the group, so the effect only refetches when
	// the group actually changes (not on every render or tab switch).
	const setCodesKey = useMemo(
		() =>
			group.sets
				.map((s) => s.code.toLowerCase())
				.sort()
				.join(','),
		[group.sets]
	);

	useEffect(() => {
		if (!setCodesKey) return;

		let cancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);
			try {
				const query = setCodesKey
					.split(',')
					.map((code) => `s:${code}`)
					.join(' OR ');
				// `unique: 'prints'` is essential: the default ('cards') deduplicates by
				// oracle name across the OR'd sets, which silently drops a set's printings
				// when the same card also exists in a sibling set (e.g. OM1 cards collapsed
				// into SPM). Completion is computed per scryfall_id, so we need every print.
				const all = await searchAllCards({
					q: `(${query})`,
					unique: 'prints',
					order: 'set',
					dir: 'asc',
				});
				if (!cancelled) setAllCards(all);
			} catch (err: unknown) {
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error('Failed to load group cards'));
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [setCodesKey]);

	const activeCards = useMemo(
		() => allCards.filter((card) => card.set === activeCode.toLowerCase()),
		[allCards, activeCode]
	);

	const groupCompletion = useMemo(
		() => computeSetCompletion(allCards, getOwnership),
		[allCards, getOwnership]
	);

	const activeCompletion = useMemo(
		() => computeSetCompletion(activeCards, getOwnership),
		[activeCards, getOwnership]
	);

	return {
		allCards,
		activeCards,
		groupCompletion,
		activeCompletion,
		isLoading,
		error,
		isPartialCollection: !isFullyLoaded,
	};
}
