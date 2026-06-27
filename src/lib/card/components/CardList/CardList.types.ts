import type { ReactNode, MouseEvent } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import type { ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';

export type AnyCard = ScryfallCard | Card | CustomCard;

export interface CardListSection {
	label: string;
	/**
	 * Stable identity for the section's open/collapsed state. Defaults to `label`.
	 * Provide this when the label embeds volatile data (e.g. a card count) so the
	 * open/collapsed state survives content changes. See `sectionKey`.
	 */
	key?: string;
	cards: AnyCard[];
	children?: CardListSection[];
	color?: string;
	border?: boolean;
	background?: boolean;
	defaultCollapsed?: boolean;
	/** When true, the section body shows a loading spinner instead of its cards. */
	loading?: boolean;
	/**
	 * Optional actions rendered on the right side of the section header, beside the
	 * label (e.g. a "select all" button). Rendered outside the collapse toggle, so
	 * interacting with them does not expand/collapse the section.
	 */
	headerActions?: ReactNode;
}

export type CardListCards = AnyCard[] | CardListSection[];

export function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export type CardListViewMode = 'grid' | 'fluid-grid' | 'table';

export const VIEW_MODE_LABELS: Record<CardListViewMode, string> = {
	grid: 'Grille',
	'fluid-grid': 'Fluid',
	table: 'Tableau',
};

export interface CardListProps {
	cards: CardListCards;
	isLoading?: boolean;
	isLoadingMore?: boolean;
	hasMore?: boolean;
	onLoadMore?: () => void;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	onCardContextMenu?: (card: AnyCard, e: MouseEvent) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	tableColumns?: CardListColumn[];
	sortOrder?: string;
	sortDir?: ScryfallSortDir;
	onSortChange?: (order: string, dir: ScryfallSortDir) => void;
	cardsPerLine?: number;
	renderItem?: (card: AnyCard, index: number) => ReactNode;
	sectionClassName?: string;
	/** @deprecated use viewModes instead */
	fluidSections?: boolean;
	viewModes?: CardListViewMode[];
	className?: string;
	pageSize?: number | false;
	showCardNames?: boolean;
	cardGap?: 'default' | 'compact';
}
