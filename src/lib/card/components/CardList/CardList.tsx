'use client';

import { useState } from 'react';
import type { CardListProps, CardListSection, CardListViewMode } from './CardList.types';
import { isSections, VIEW_MODE_LABELS } from './CardList.types';
import { CardListGrid } from '@/lib/card/components/CardListGrid/CardListGrid';
import { CardListTable } from '@/lib/card/components/CardListTable/CardListTable';
import { useInfiniteScroll } from './useInfiniteScroll';
import { Spinner } from '@/components/Spinner/Spinner';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './CardList.module.css';

function useCollapsedSections(sections: CardListSection[] | undefined) {
	const [state, setState] = useState<Set<string>>(new Set());

	const effective = new Set(state);
	if (sections) {
		for (const sec of sections) {
			if (sec.defaultCollapsed && !state.has(`opened:${sec.label}`)) {
				effective.add(sec.label);
			}
		}
	}

	function toggle(label: string) {
		setState((prev) => {
			const next = new Set(prev);
			if (effective.has(label)) {
				next.delete(label);
				next.add(`opened:${label}`);
			} else {
				next.add(label);
				next.delete(`opened:${label}`);
			}
			return next;
		});
	}

	return { effectiveCollapsed: effective, toggleSection: toggle };
}

export function CardList({
	cards: cardsOrSections,
	isLoading = false,
	isLoadingMore = false,
	hasMore = false,
	onLoadMore,
	skeletonCount,
	onCardClick,
	onCardContextMenu,
	renderOverlay,
	tableColumns,
	sortOrder,
	sortDir,
	onSortChange,
	cardsPerLine,
	renderItem,
	sectionClassName,
	fluidSections,
	viewModes = ['grid', 'table'],
	className,
	pageSize = PAGE_SIZE,
	showCardNames = false,
	cardGap = 'default',
}: CardListProps) {
	const [viewMode, setViewMode] = useState<CardListViewMode>(viewModes[0]);
	const sections = isSections(cardsOrSections) ? (cardsOrSections as CardListSection[]) : undefined;
	const { effectiveCollapsed, toggleSection } = useCollapsedSections(sections);
	const cards = isSections(cardsOrSections) ? [] : cardsOrSections;

	const localPageSize = typeof pageSize === 'number' ? pageSize : null;

	const [{ visibleCount, trackedLength }, setInternalPagination] = useState({
		visibleCount: localPageSize ?? cards.length,
		trackedLength: cards.length,
	});

	let effectiveVisibleCount: number;
	if (localPageSize !== null) {
		effectiveVisibleCount = cards.length !== trackedLength ? localPageSize : visibleCount;
	} else {
		effectiveVisibleCount = cards.length;
	}

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

	const toggle = viewModes.length > 1 && (
		<div className={styles.viewToggle}>
			{viewModes.map((mode) => (
				<button
					key={mode}
					type="button"
					className={`${styles.toggleBtn} ${viewMode === mode ? styles.toggleBtnActive : ''}`}
					onClick={() => setViewMode(mode)}
				>
					{VIEW_MODE_LABELS[mode]}
				</button>
			))}
		</div>
	);

	const isFluid = viewMode === 'fluid-grid' || fluidSections;

	// Sections mode — CardListGrid and CardListTable handle section layout
	if (sections) {
		return (
			<>
				{toggle}
				{viewMode === 'table' ? (
					<CardListTable
						cards={[]}
						columns={tableColumns ?? []}
						sections={sections}
						isLoading={isLoading}
						onCardClick={onCardClick}
						sortOrder={sortOrder}
						sortDir={sortDir}
						onSortChange={onSortChange}
						collapsedSections={effectiveCollapsed}
						onSectionToggle={toggleSection}
					/>
				) : (
					<CardListGrid
						cards={[]}
						sections={sections}
						onCardClick={onCardClick}
						onCardContextMenu={onCardContextMenu}
						renderOverlay={renderOverlay}
						renderItem={renderItem}
						cardsPerLine={cardsPerLine}
						collapsedSections={effectiveCollapsed}
						onSectionToggle={toggleSection}
						sectionClassName={sectionClassName}
						fluidSections={isFluid}
						className={className}
						showCardNames={showCardNames}
						cardGap={cardGap}
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
					isLoading={isLoading}
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
				onCardContextMenu={onCardContextMenu}
				renderOverlay={renderOverlay}
				renderItem={renderItem}
				cardsPerLine={cardsPerLine}
				fluidSections={isFluid}
				className={className}
				showCardNames={showCardNames}
				cardGap={cardGap}
			/>
			{sentinel}
		</>
	);
}
