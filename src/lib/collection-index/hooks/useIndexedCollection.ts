'use client';

import { useMemo, useState } from 'react';
import {
	defaultCollectionFilters,
	type CollectionFilters,
} from '@/lib/card/utils/filterCollectionCards';
import { filterStacks, groupByStack } from '@/lib/card/utils/group-cards';
import { computeCollectionStats } from '@/app/[locale]/collection/lib/CollectionView/stats';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { countActiveFilters } from '@/lib/search/types';
import type { CardEntry, FacetCopy, FacetStack, StackBy } from '@/types/cards';
import { useCollectionIndex } from '../context/CollectionIndexProvider';
import { usePagedCards } from './usePagedCards';
import type { CollectionModel } from '../collection-model';

const EMPTY_STACK_BY: StackBy = [];

/**
 * Owner collection / wishlist: sort, filter, group and stats run on the global
 * facets index (instant); full cards are resolved only for the visible page + 1.
 * `filterable: false` (wishlist) keeps entry order and skips filtering.
 */
export function useIndexedCollection(
	entries: Array<{ scryfallId: string; entry: CardEntry }>,
	opts: { filterable: boolean; stackBy?: StackBy }
): CollectionModel & { allStacks: FacetStack[] } {
	const stackBy = opts.stackBy ?? EMPTY_STACK_BY;
	const index = useCollectionIndex();
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const facetStacks = useMemo<FacetStack[]>(() => {
		const copies: FacetCopy[] = [];
		for (const { scryfallId, entry } of entries) {
			const f = index.getFacets(scryfallId);
			if (f) copies.push({ ...f, entry } as FacetCopy);
		}
		if (!opts.filterable) {
			// Wishlist: no sort UI, but entries hydrate in `.order('id')` (random
			// uuid) order — restore a stable, meaningful order before stacking.
			copies.sort((a, b) => {
				const cmp = a.entry.dateAdded.localeCompare(b.entry.dateAdded);
				return cmp !== 0 ? cmp : a.entry.rowId.localeCompare(b.entry.rowId);
			});
		}
		const grouped = groupByStack(copies, stackBy);
		return opts.filterable ? filterStacks(grouped, filters) : grouped;
	}, [entries, index.getFacets, filters, opts.filterable, stackBy]);

	const stats = useMemo(() => computeCollectionStats(facetStacks), [facetStacks]);
	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
	const stackKey = JSON.stringify(stackBy);
	const resetKey = opts.filterable
		? `${JSON.stringify(filters)}|${stackKey}`
		: `static|${stackKey}`;
	const paged = usePagedCards(facetStacks, resetKey);

	const indexLoading = index.status === 'loading';
	return {
		filters,
		setFilters,
		activeFilterCount,
		sets,
		setsLoading,
		stats,
		visibleStacks: paged.visibleStacks,
		/** Every filtered stack (all pages), for "select all" and bulk resolution. */
		allStacks: facetStacks,
		hasMore: paged.hasMore,
		loadMore: paged.loadMore,
		// Mitigates a known usePagedCards edge case where isLoadingMore can stay
		// true after the last page has already loaded.
		isLoadingMore: paged.isLoadingMore && paged.hasMore,
		isInitialLoading: indexLoading || (index.status === 'ready' && paged.isFirstPageLoading),
		error: index.status === 'error' ? index.error : paged.error,
		retry: index.status === 'error' ? index.retry : paged.retry,
	};
}
