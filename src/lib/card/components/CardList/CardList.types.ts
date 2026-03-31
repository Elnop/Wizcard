import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';

export type AnyCard = ScryfallCard | Card;

export interface CardListSection {
	label: string;
	cards: AnyCard[];
}

export type CardListCards = AnyCard[] | CardListSection[];

export function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export interface CardListProps {
	cards: CardListCards;
	// Pagination intégrée
	isLoading?: boolean;
	isLoadingMore?: boolean;
	hasMore?: boolean;
	onLoadMore?: () => void;
	skeletonCount?: number;
	// Interactions
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	// Table
	tableColumns?: CardListColumn[];
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	// Grille : nombre de cartes par ligne (fixe la taille des cartes)
	cardsPerLine?: number;
	className?: string;
	pageSize?: number | false;
}
