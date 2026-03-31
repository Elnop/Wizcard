import type { ReactNode } from 'react';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';

export interface CardListGridProps {
	cards: AnyCard[];
	sections?: CardListSection[];
	isLoading?: boolean;
	isLoadingMore?: boolean;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	cardsPerLine?: number;
	collapsedSections?: Set<string>;
	onSectionToggle?: (label: string) => void;
	className?: string;
}
