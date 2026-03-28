import type { ReactNode } from 'react';
import type { AnyCard } from '@/components/ui/CardList/CardList.types';
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';

export interface CardListColumn {
	key: string;
	label: string;
	sortKey?: string;
	render?: (card: AnyCard) => ReactNode;
}

export interface CardListTableProps {
	cards: AnyCard[];
	columns: CardListColumn[];
	onCardClick?: (card: AnyCard) => void;
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
}
