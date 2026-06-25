'use client';

import { useState, useMemo } from 'react';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { filterStacks } from '@/lib/card/utils/group-cards';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { computeCollectionStats } from '@/lib/collection/utils/stats';
import { countActiveFilters } from '@/lib/search/types';
import type { CardStack } from '@/types/cards';

export function useCollectionFiltering(stacks: CardStack[]) {
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const filteredStacks = useMemo(() => filterStacks(stacks, filters), [stacks, filters]);

	const stats = useMemo(() => computeCollectionStats(filteredStacks), [filteredStacks]);

	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	return { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount };
}
