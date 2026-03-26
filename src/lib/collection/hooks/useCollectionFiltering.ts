'use client';

import { useState, useMemo } from 'react';
import {
	filterCollectionCards,
	defaultCollectionFilters,
	getSortValue,
} from '@/lib/collection/utils/filterCollectionCards';
import type { CollectionFilters } from '@/lib/collection/utils/filterCollectionCards';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { computeCollectionStats } from '@/lib/collection/utils/stats';
import { countActiveFilters } from '@/lib/filters/types';
import type { CardStack } from '@/types/cards';

export function useCollectionFiltering(stacks: CardStack[]) {
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const representativeCards = useMemo(
		() => stacks.map((s) => s.cards[0]).filter(Boolean),
		[stacks]
	);
	const filteredRepCards = useMemo(
		() => filterCollectionCards(representativeCards, filters),
		[representativeCards, filters]
	);

	const filteredStacks = useMemo(() => {
		const stackByName = new Map(stacks.map((s) => [s.name, s]));
		const { order, dir } = filters;
		return filteredRepCards
			.map((c) => stackByName.get(c.name))
			.filter(Boolean)
			.map((stack) => {
				if (stack!.cards.length <= 1) return stack!;
				const sorted = [...stack!.cards].sort((a, b) => {
					const av = getSortValue(a, order);
					const bv = getSortValue(b, order);
					let cmp: number;
					if (typeof av === 'number' && typeof bv === 'number') {
						cmp = av - bv;
					} else {
						cmp = String(av).localeCompare(String(bv));
					}
					if (dir === 'desc') cmp = -cmp;
					if (cmp === 0) cmp = a.entry.dateAdded.localeCompare(b.entry.dateAdded);
					return cmp;
				});
				return { ...stack!, cards: sorted };
			}) as CardStack[];
	}, [stacks, filteredRepCards, filters]);

	const stats = useMemo(() => computeCollectionStats(filteredStacks), [filteredStacks]);

	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	return { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount };
}
