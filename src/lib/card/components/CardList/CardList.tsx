'use client';

import { useState } from 'react';
import type { CardListProps } from './CardList.types';
import { isSections } from './CardList.types';
import { CardListGrid } from '@/lib/card/components/CardListGrid/CardListGrid';
import { CardListTable } from '@/lib/card/components/CardListTable/CardListTable';
import { useInfiniteScroll } from './useInfiniteScroll';
import { Spinner } from '@/components/Spinner/Spinner';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './CardList.module.css';

export function CardList({
	cards: cardsOrSections,
	isLoading = false,
	isLoadingMore = false,
	hasMore = false,
	onLoadMore,
	skeletonCount,
	onCardClick,
	renderOverlay,
	tableColumns,
	sortOrder,
	sortDir,
	onSortChange,
	cardsPerLine,
	renderItem,
	sectionClassName,
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
	const sections = isSections(cardsOrSections) ? cardsOrSections : undefined;

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

	const sentinel = resolvedHasMore && resolvedLoadMore && (
		<>
			<div ref={sentinelRef} />
			<div className={styles.loaderWrapper}>
				<Spinner size="md" />
			</div>
		</>
	);

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

	// Sections mode — CardListGrid handles section layout
	if (sections) {
		const sectionCards = sections.flatMap((s) => s.cards);
		return (
			<>
				{toggle}
				{viewMode === 'table' ? (
					<CardListTable
						cards={sectionCards}
						columns={tableColumns ?? []}
						onCardClick={onCardClick}
						sortOrder={sortOrder}
						sortDir={sortDir}
						onSortChange={onSortChange}
					/>
				) : (
					<CardListGrid
						cards={[]}
						sections={sections}
						onCardClick={onCardClick}
						renderOverlay={renderOverlay}
						renderItem={renderItem}
						cardsPerLine={cardsPerLine}
						collapsedSections={collapsedSections}
						onSectionToggle={toggleSection}
						sectionClassName={sectionClassName}
						className={className}
					/>
				)}
				{sentinel}
			</>
		);
	}

	if (viewMode === 'table') {
		return (
			<>
				{toggle}
				<CardListTable
					cards={visibleCards}
					columns={tableColumns ?? []}
					onCardClick={onCardClick}
					sortOrder={sortOrder}
					sortDir={sortDir}
					onSortChange={onSortChange}
				/>
				{sentinel}
			</>
		);
	}

	return (
		<>
			{toggle}
			<CardListGrid
				cards={visibleCards}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				skeletonCount={skeletonCount}
				onCardClick={onCardClick}
				renderOverlay={renderOverlay}
				renderItem={renderItem}
				cardsPerLine={cardsPerLine}
				className={className}
			/>
			{sentinel}
		</>
	);
}
