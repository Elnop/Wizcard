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

export interface CardListSection {
	label: string;
	cards: AnyCard[];
}

type CardListCards = AnyCard[] | CardListSection[];

function isSections(cards: CardListCards): cards is CardListSection[] {
	return cards.length > 0 && 'label' in (cards[0] as object);
}

export interface CardListColumn {
	key: string;
	label: string;
	sortKey?: string;
	render?: (card: AnyCard) => ReactNode;
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
	cards: cardsOrSections,
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
	const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

	function toggleSection(label: string) {
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	}

	const cards = isSections(cardsOrSections) ? [] : cardsOrSections;

	function handleHeaderClick(key: string) {
		if (!onSortChange) return;
		if (sortOrder === key) {
			onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			onSortChange(key, 'asc');
		}
	}

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

	// Grid view
	const gridClass = [cardsPerLine ? styles.gridFixed : styles.grid, className]
		.filter(Boolean)
		.join(' ');
	const gridStyle = cardsPerLine
		? ({ '--cards-per-line': cardsPerLine } as React.CSSProperties)
		: undefined;

	const showInitialSkeletons = isLoading && cards.length === 0;

	function renderGrid(cardItems: AnyCard[], withLoadMoreSkeletons = false) {
		return (
			<div className={gridClass} style={gridStyle}>
				{cardItems.map((c) => (
					<div
						key={c.id}
						className={[styles.item, onCardClick ? styles.itemClickable : undefined]
							.filter(Boolean)
							.join(' ')}
						onClick={onCardClick ? () => onCardClick(c) : undefined}
					>
						<div className={styles.imageWrapper}>
							<CardImage card={c} size="normal" />
							{renderOverlay?.(c)}
						</div>
						<p className={styles.cardName}>{c.name}</p>
					</div>
				))}
				{withLoadMoreSkeletons &&
					isLoadingMore &&
					Array.from({ length: skeletonCount }).map((_, i) => (
						<div key={`skmore-${i}`} className={styles.item}>
							<div className={styles.skeletonImage} />
							<div className={styles.skeletonName} />
						</div>
					))}
			</div>
		);
	}

	function renderTable(cardItems: AnyCard[]) {
		const columns = tableColumns ?? [];
		return (
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
									{col.sortKey && sortOrder === col.sortKey && <SortIcon dir={sortDir ?? 'asc'} />}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{cardItems.map((c) => (
							<tr
								key={c.id}
								className={onCardClick ? styles.clickableRow : undefined}
								onClick={onCardClick ? () => onCardClick(c) : undefined}
							>
								{columns.map((col) => (
									<td key={col.key}>
										{col.render
											? col.render(c)
											: String((c as unknown as Record<string, unknown>)[col.key] ?? '')}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	}

	// Note: isSections([]) returns false, so an empty sections array falls through
	// to flat-mode rendering (shows skeleton when isLoading, null when empty).
	// This is correct for PrintsTab: loading → empty array → skeleton, no data → null.
	if (isSections(cardsOrSections)) {
		return (
			<>
				{toggle}
				{cardsOrSections.map((section, idx) => {
					const collapsed = collapsedSections.has(section.label);
					const labelMatch = section.label.match(/^(.+?)\s*(\(\d+\))$/);
					const labelName = labelMatch?.[1] ?? section.label;
					const labelCount = labelMatch?.[2] ?? '';
					return (
						<div
							key={section.label}
							className={idx === 0 ? styles.sectionWrapperFirst : styles.sectionWrapper}
						>
							<button
								type="button"
								className={styles.sectionHeader}
								onClick={() => toggleSection(section.label)}
							>
								<span>
									{labelName}
									{labelCount && <span className={styles.sectionCount}> {labelCount}</span>}
								</span>
								<span
									className={[styles.chevron, collapsed ? styles.chevronCollapsed : '']
										.filter(Boolean)
										.join(' ')}
								>
									▾
								</span>
							</button>
							{!collapsed && (
								<div className={styles.sectionBody}>
									{viewMode === 'table' ? renderTable(section.cards) : renderGrid(section.cards)}
								</div>
							)}
						</div>
					);
				})}
			</>
		);
	}

	if (viewMode === 'table') {
		return (
			<>
				{toggle}
				{renderTable(visibleCards)}
				{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
			</>
		);
	}

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
			{renderGrid(visibleCards, true)}
			{resolvedHasMore && resolvedLoadMore && <div ref={sentinelRef} />}
		</>
	);
}
