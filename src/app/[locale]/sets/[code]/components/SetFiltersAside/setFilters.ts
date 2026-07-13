import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import {
	type CollectionFilters,
	defaultCollectionFilters,
	filterCollectionCards,
} from '@/lib/card/utils/filterCollectionCards';
import type { SetCompletion } from '../../utils/setCompletion';

/** Ownership-based filter, specific to the set page (cross-referenced with the collection). */
export type OwnershipFilter = 'all' | 'owned' | 'missing' | 'foil';

/**
 * Set-page filters: the shared collection filter shape (name, colors, rarity,
 * type, oracle, cmc, sort…) plus an ownership filter that only makes sense here.
 * The `set` filter is unused (we're already inside one set).
 */
export interface SetFilters extends CollectionFilters {
	ownership: OwnershipFilter;
}

export const defaultSetFilters: SetFilters = {
	...defaultCollectionFilters,
	order: 'set',
	dir: 'asc',
	ownership: 'all',
};

function matchesOwnership(
	card: ScryfallCard,
	ownership: OwnershipFilter,
	completion: SetCompletion
): boolean {
	if (ownership === 'all') return true;
	const status = completion.status.get(card.id);
	if (ownership === 'owned') return Boolean(status?.owned);
	if (ownership === 'missing') return !status?.owned;
	if (ownership === 'foil') return Boolean(status?.foil);
	return true;
}

/**
 * Applies the set filters to the full print list, client-side: ownership first
 * (set-specific), then the shared collection filters (which also handle sorting).
 */
export function filterSetCards(
	cards: ScryfallCard[],
	filters: SetFilters,
	completion: SetCompletion
): ScryfallCard[] {
	const byOwnership =
		filters.ownership === 'all'
			? cards
			: cards.filter((c) => matchesOwnership(c, filters.ownership, completion));
	return filterCollectionCards(byOwnership, filters);
}

/**
 * Count of active filters. The default sort here is `set/asc` (not `name`), so we
 * count sorting against that baseline rather than reusing the collection helper.
 */
export function countActiveSetFilters(filters: SetFilters): number {
	const sortChanged =
		filters.order !== defaultSetFilters.order || filters.dir !== defaultSetFilters.dir;
	return (
		filters.colors.length +
		filters.rarities.length +
		(filters.type.length > 0 ? 1 : 0) +
		(filters.name ? 1 : 0) +
		(filters.oracleText ? 1 : 0) +
		(filters.cmc ? 1 : 0) +
		(filters.ownership !== 'all' ? 1 : 0) +
		(sortChanged ? 1 : 0)
	);
}
