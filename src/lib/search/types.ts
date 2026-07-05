import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';

export type ColorMatch = 'exact' | 'include' | 'atMost';

export type SearchMode = 'official' | 'custom' | 'backs';

export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: ColorMatch;
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
}

export const DEFAULT_CARD_FILTERS: CardFilters = {
	name: '',
	colors: [],
	colorMatch: 'include',
	colorIdentity: [],
	colorIdentityMatch: 'atMost',
	type: [],
	set: '',
	rarities: [],
	oracleText: '',
	cmc: '',
	order: 'name',
	dir: 'asc',
};

export function countActiveFilters(
	filters:
		| CardFilters
		| (Omit<CardFilters, 'order' | 'dir'> & { order: string; dir: ScryfallSortDir })
		| (Omit<CardFilters, 'order' | 'dir'> & {
				order: string;
				dir: ScryfallSortDir;
				proxyFilter?: 'all' | 'official' | 'proxy';
				foilTypeFilter?: 'none' | 'all' | 'foil' | 'etched';
				languageFilter?: string;
				deckAssignment?: 'all' | 'assigned' | 'unassigned';
		  })
): number {
	return (
		filters.colors.length +
		filters.colorIdentity.length +
		(filters.type.length > 0 ? 1 : 0) +
		(filters.set ? 1 : 0) +
		(filters.order !== 'name' || (filters.dir !== 'auto' && filters.dir !== 'asc') ? 1 : 0) +
		filters.rarities.length +
		(filters.oracleText ? 1 : 0) +
		(filters.cmc ? 1 : 0) +
		(filters.name ? 1 : 0) +
		('proxyFilter' in filters && filters.proxyFilter !== 'all' ? 1 : 0) +
		('foilTypeFilter' in filters && filters.foilTypeFilter !== 'all' ? 1 : 0) +
		('languageFilter' in filters && filters.languageFilter !== 'all' ? 1 : 0) +
		('deckAssignment' in filters && filters.deckAssignment !== 'all' ? 1 : 0)
	);
}
