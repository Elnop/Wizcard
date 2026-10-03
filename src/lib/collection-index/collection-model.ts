import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { CardStack, CollectionStats } from '@/types/cards';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';

/**
 * Owner-agnostic view model for `CollectionView`: filters + sets + stats +
 * the current page of stacks, regardless of whether they're derived from the
 * global facets index (`useIndexedCollection`) or already-full stacks
 * (`useStackCollectionModel`).
 */
export interface CollectionModel {
	filters: CollectionFilters;
	setFilters: (f: CollectionFilters) => void;
	activeFilterCount: number;
	sets: ScryfallSet[];
	setsLoading: boolean;
	stats: CollectionStats;
	visibleStacks: CardStack[];
	hasMore: boolean;
	loadMore: () => void;
	isLoadingMore: boolean;
	/** True until the first page can be shown. */
	isInitialLoading: boolean;
	error: Error | null;
	retry: () => void;
}
