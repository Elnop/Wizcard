import type { ReactNode, MouseEvent } from 'react';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';

export interface CardListGridProps {
	cards: AnyCard[];
	sections?: CardListSection[];
	isLoading?: boolean;
	isLoadingMore?: boolean;
	skeletonCount?: number;
	onCardClick?: (card: AnyCard) => void;
	/**
	 * Standard right-click menu: returns the items for a card (or null to suppress).
	 * CardListGrid owns the menu state and renders the shared `<ContextMenu>` itself.
	 */
	buildCardMenuItems?: (card: AnyCard, close: () => void) => ContextMenuAction[] | null;
	/**
	 * Lower-level right-click escape hatch for callers that render their own menu.
	 * Receives the raw event (already prevented/stopped is the caller's job).
	 * Ignored when `buildCardMenuItems` is provided.
	 */
	onCardContextMenu?: (card: AnyCard, e: MouseEvent) => void;
	renderOverlay?: (card: AnyCard) => ReactNode;
	renderItem?: (card: AnyCard, index: number) => ReactNode;
	cardsPerLine?: number;
	collapsedSections?: Set<string>;
	onSectionToggle?: (label: string) => void;
	sectionClassName?: string;
	fluidSections?: boolean;
	className?: string;
	showCardNames?: boolean;
	cardGap?: 'default' | 'compact';
}
