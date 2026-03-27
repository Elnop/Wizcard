'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { ScryfallSortDir } from '@/components/ui/filters/SortFilter/SortFilter';
import { CardImage } from '@/components/cards/CardImage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './CardList.module.css';

type AnyCard = ScryfallCard | Card;

export interface CardListColumn {
	key: string;
	label: string;
	sortKey?: string;
	render?: (card: AnyCard) => ReactNode;
}

export interface CardListProps {
	cards: AnyCard[];
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

function SortIcon({ dir }: { dir: ScryfallSortDir }) {
	if (dir === 'desc') {
		return (
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M8 3v10M4 9l4 4 4-4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M8 13V3M4 7l4-4 4 4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const DEFAULT_SKELETON_COUNT = 12;

// CSS class names intended for use inside renderOverlay
export const cardListOverlayStyles = {
	removeButton: styles.cardRemoveBtn,
};

export function CardList({
	cards,
	isLoading = false,
	isLoadingMore = false,
	hasMore = false,
	onLoadMore,
	skeletonCount = DEFAULT_SKELETON_COUNT,
	onCardClick,
	renderOverlay,
	tableColumns,
	sortOrder,
	sortDir,
	onSortChange,
	cardsPerLine,
	className,
	pageSize = PAGE_SIZE,
}: CardListProps) {
	function handleHeaderClick(key: string) {
		if (!onSortChange) return;
		if (sortOrder === key) {
			onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			onSortChange(key, 'asc');
		}
	}
	const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

	const localPageSize = typeof pageSize === 'number' ? pageSize : null;

	const [{ visibleCount, trackedLength }, setInternalPagination] = useState({
		visibleCount: localPageSize ?? cards.length,
		trackedLength: cards.length,
	});

	const effectiveVisibleCount =
		localPageSize !== null
			? cards.length !== trackedLength
				? localPageSize
				: visibleCount
			: cards.length;

	const internalHasMore = localPageSize !== null ? effectiveVisibleCount < cards.length : false;
	const internalLoadMore = () =>
		setInternalPagination((prev) => ({
			trackedLength: cards.length,
			visibleCount: prev.visibleCount + localPageSize!,
		}));

	const visibleCards = localPageSize !== null ? cards.slice(0, effectiveVisibleCount) : cards;
	const resolvedHasMore = localPageSize !== null ? internalHasMore : hasMore;
	const resolvedLoadMore = localPageSize !== null ? internalLoadMore : onLoadMore;

	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: resolvedLoadMore ?? (() => {}),
		hasMore: resolvedHasMore && !!resolvedLoadMore,
		isLoading: isLoading || isLoadingMore,
	});

	const toggle = (
		<div className={styles.viewToggle}>
			<button
				type="button"
				className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
				onClick={() => setViewMode('grid')}
			>
				Grille
			</button>
			<button
				type="button"
				className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.toggleBtnActive : ''}`}
				onClick={() => setViewMode('table')}
			>
				Tableau
			</button>
		</div>
	);

	if (viewMode === 'table') {
		const columns = tableColumns ?? [];
		return (
			<>
				{toggle}
				<div className={styles.tableContainer}>
					<table className={styles.table}>
						<thead>
							<tr>
								{columns.map((col) => (
									<th
										key={col.key}
										onClick={col.sortKey ? () => handleHeaderClick(col.sortKey!) : undefined}
										className={col.sortKey ? styles.thSortable : undefined}
										aria-sort={
											col.sortKey && sortOrder === col.sortKey
												? sortDir === 'desc'
													? 'descending'
													: 'ascending'
												: undefined
										}
									>
										{col.label}
										{col.sortKey && sortOrder === col.sortKey && (
											<SortIcon dir={sortDir ?? 'asc'} />
										)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{visibleCards.map((card) => (
								<tr
									key={card.id}
									className={onCardClick ? styles.clickableRow : undefined}
									onClick={onCardClick ? () => onCardClick(card) : undefined}
								>
									{columns.map((col) => (
										<td key={col.key}>
											{col.render
												? col.render(card)
												: String((card as unknown as Record<string, unknown>)[col.key] ?? '')}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
			</>
		);
	}

	// Grid view
	const gridClass = [cardsPerLine ? styles.gridFixed : styles.grid, className]
		.filter(Boolean)
		.join(' ');
	const gridStyle = cardsPerLine
		? ({ '--cards-per-line': cardsPerLine } as React.CSSProperties)
		: undefined;

	const showInitialSkeletons = isLoading && cards.length === 0;

	if (showInitialSkeletons) {
		return (
			<>
				{toggle}
				<div className={gridClass} style={gridStyle}>
					{Array.from({ length: skeletonCount }).map((_, i) => (
						<div key={`sk-${i}`} className={styles.item}>
							<div className={styles.skeletonImage} />
							<div className={styles.skeletonName} />
						</div>
					))}
				</div>
			</>
		);
	}

	if (!isLoading && cards.length === 0) {
		return null;
	}

	return (
		<>
			{toggle}
			<div className={gridClass} style={gridStyle}>
				{visibleCards.map((card) => (
					<div
						key={card.id}
						className={[styles.item, onCardClick ? styles.itemClickable : undefined]
							.filter(Boolean)
							.join(' ')}
						onClick={onCardClick ? () => onCardClick(card) : undefined}
					>
						<div className={styles.imageWrapper}>
							<CardImage card={card} size="normal" />
							{renderOverlay?.(card)}
						</div>
						<p className={styles.cardName}>{card.name}</p>
					</div>
				))}
				{isLoadingMore &&
					Array.from({ length: skeletonCount }).map((_, i) => (
						<div key={`skmore-${i}`} className={styles.item}>
							<div className={styles.skeletonImage} />
							<div className={styles.skeletonName} />
						</div>
					))}
			</div>
			{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
		</>
	);
}
