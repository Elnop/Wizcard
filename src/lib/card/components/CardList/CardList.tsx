'use client';

import { useState, useMemo } from 'react';
import type { CardListProps, CardListSection, CardListViewMode } from './CardList.types';
import { isSections, VIEW_MODE_LABELS } from './CardList.types';
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
	// Labels the user has explicitly opened (overrides defaultCollapsed)
	const [explicitlyOpened, setExplicitlyOpened] = useState<Set<string>>(new Set());
	// Labels the user has explicitly closed (overrides defaultCollapsed=false)
	const [explicitlyClosed, setExplicitlyClosed] = useState<Set<string>>(new Set());

	const collapsedSections = useMemo(() => {
		const incoming = isSections(cardsOrSections) ? (cardsOrSections as CardListSection[]) : [];
		const result = new Set<string>();
		for (const sec of incoming) {
			let collapsed = !!sec.defaultCollapsed;
			if (explicitlyOpened.has(sec.label)) collapsed = false;
			if (explicitlyClosed.has(sec.label)) collapsed = true;
			if (collapsed) result.add(sec.label);
		}
		return result;
	}, [cardsOrSections, explicitlyOpened, explicitlyClosed]);

	function toggleSection(label: string) {
		if (collapsedSections.has(label)) {
			setExplicitlyOpened((prev) => {
				const n = new Set(prev);
				n.add(label);
				return n;
			});
			setExplicitlyClosed((prev) => {
				const n = new Set(prev);
				n.delete(label);
				return n;
			});
		} else {
			setExplicitlyClosed((prev) => {
				const n = new Set(prev);
				n.add(label);
				return n;
			});
			setExplicitlyOpened((prev) => {
				const n = new Set(prev);
				n.delete(label);
				return n;
			});
		}
	}

	const cards = isSections(cardsOrSections) ? [] : cardsOrSections;
	const sections = isSections(cardsOrSections) ? cardsOrSections : undefined;

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
						collapsedSections={collapsedSections}
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
						collapsedSections={collapsedSections}
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
