'use client';

import { useState } from 'react';
import type { CardStack } from '@/types/cards';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useCollectionFiltering } from '@/app/[locale]/collection/lib/CollectionView/useCollectionFiltering';
import type { CollectionModel } from '../collection-model';

/** Adapter for pages that already hold every full stack (public collection). */
export function useStackCollectionModel(stacks: CardStack[], isLoading: boolean): CollectionModel {
	const { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount } =
		useCollectionFiltering(stacks);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [trackedFilters, setTrackedFilters] = useState(filters);
	if (trackedFilters !== filters) {
		setTrackedFilters(filters);
		setVisibleCount(PAGE_SIZE);
	}
	return {
		filters,
		setFilters,
		activeFilterCount,
		sets,
		setsLoading,
		stats,
		visibleStacks: filteredStacks.slice(0, visibleCount),
		hasMore: visibleCount < filteredStacks.length,
		loadMore: () => setVisibleCount((v) => v + PAGE_SIZE),
		isLoadingMore: false,
		isInitialLoading: isLoading,
		error: null,
		retry: () => {},
	};
}
