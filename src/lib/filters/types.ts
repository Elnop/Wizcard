import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type {
	ScryfallSortOrder,
	ScryfallSortDir,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';

export interface CardFilters {
	name: string;
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	type: string;
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
	type: '',
	set: '',
	rarities: [],
	oracleText: '',
	cmc: '',
	order: 'name',
	dir: 'auto',
};

export function countActiveFilters(filters: CardFilters): number {
	return (
		filters.colors.length +
		(filters.type ? 1 : 0) +
		(filters.set ? 1 : 0) +
		(filters.order !== 'name' || filters.dir !== 'auto' ? 1 : 0) +
		filters.rarities.length +
		(filters.oracleText ? 1 : 0) +
		(filters.cmc ? 1 : 0) +
		(filters.name ? 1 : 0)
	);
}
