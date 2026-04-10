import type { ReactNode } from 'react';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';

export interface CardListColumn {
	key: string;
	label: string;
	sortKey?: string;
	render?: (card: AnyCard) => ReactNode;
}

export interface CardListTableProps {
	cards: AnyCard[];
	columns: CardListColumn[];
	sections?: CardListSection[];
	isLoading?: boolean;
	onCardClick?: (card: AnyCard) => void;
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	collapsedSections?: Set<string>;
	onSectionToggle?: (key: string) => void;
}
