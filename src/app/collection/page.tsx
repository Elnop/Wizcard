'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import type { CollectionFilters } from '@/lib/collection/utils/filterCollectionCards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { useImportContext } from '@/lib/import/contexts/ImportContext';
import { useCollectionFiltering } from '@/lib/collection/hooks/useCollectionFiltering';
import { useCardCollectionModal } from '@/lib/collection/CardCollectionModal/hooks/useCardCollectionModal';
import { CollectionFiltersAside } from '@/lib/collection/components/CollectionFiltersAside/CollectionFiltersAside';
import { ImportPreviewModal } from '@/lib/collection/components/ImportPreviewModal/ImportPreviewModal';
import { CardCollectionModal } from '@/lib/collection/CardCollectionModal/CardCollectionModal';
import { CardList, cardListOverlayStyles } from '@/components/ui/CardList/CardList';
import { Button } from '@/components/ui/Button/Button';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { PAGE_SIZE } from '@/lib/collection/constants';
import styles from './page.module.css';

function useStackPagination(stacks: CardStack[]) {
	const [{ visibleCount, trackedLength }, setPagination] = useState({
		visibleCount: PAGE_SIZE,
		trackedLength: stacks.length,
	});

	const effectiveVisibleCount = stacks.length !== trackedLength ? PAGE_SIZE : visibleCount;
	const hasMore = effectiveVisibleCount < stacks.length;

	const loadMore = () =>
		setPagination((prev) => ({
			trackedLength: stacks.length,
			visibleCount: prev.visibleCount + PAGE_SIZE,
		}));

	const visibleStacks = stacks.slice(0, effectiveVisibleCount);

	return { visibleStacks, hasMore, loadMore };
}

export default function CollectionPage() {
	const { entries, isLoaded, decrementCard, clearCollection } = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const importCtx = useImportContext();

	const { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount } =
		useCollectionFiltering(stacks);

	const {
		resolvedStack,
		handleCardClick,
		handleCloseModal,
		handleSaveModal,
		handleRemoveModal,
		handleIncrementModal,
		handleDecrementModal,
		handleDuplicateEntry,
		handleRemoveEntry,
		handleChangePrint,
	} = useCardCollectionModal(stacks);

	const handleExport = useCallback(() => {
		downloadCSV(serializeToMoxfieldCSV(stacks.flatMap((s) => s.cards)), 'my-collection.csv');
	}, [stacks]);

	const handleClearCollection = useCallback(() => {
		if (confirm('Effacer toute la collection ? Cette action est irréversible.')) {
			clearCollection();
		}
	}, [clearCollection]);

	const handleConfirmImport = useCallback(async () => {
		await importCtx.confirm();
		importCtx.reset();
	}, [importCtx]);

	const { visibleStacks, hasMore, loadMore } = useStackPagination(filteredStacks);

	const skeletonCount = isHydrating ? Math.max(0, (totalExpected ?? 0) - filteredStacks.length) : 0;

	const representativeCards = useMemo(
		() =>
			visibleStacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[visibleStacks]
	);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of visibleStacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [visibleStacks]);

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

	const {
		status,
		progress,
		preview,
		fetchedCards,
		isLoadingPreview,
		openModal,
		selectFile,
		submitText,
		changeFormat,
		cancel,
		updateRow,
		removeRow,
		formatRegistry,
	} = importCtx;
	const isImporting = status === 'fetching' || status === 'merging';
	const isBusy = status === 'previewing' || isImporting;

	return (
		<div className={styles.page}>
			<div className={styles.layout}>
				<CollectionFiltersAside
					filters={filters}
					onChange={setFilters}
					sets={sets}
					setsLoading={setsLoading}
					activeFilterCount={activeFilterCount}
				/>

				<main className={styles.main}>
					<div className={styles.titleSection}>
						<div className={styles.titleLeft}>
							<h1 className={styles.title}>My Collection</h1>
							{entries.length > 0 && !isHydrating && (
								<p className={styles.statsLine}>
									{stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''} &middot;{' '}
									{stats.uniqueCards} unique &middot; {stats.setCount} set
									{stats.setCount !== 1 ? 's' : ''}
								</p>
							)}
						</div>
						<div className={styles.actions}>
							{entries.length > 0 && (
								<>
									<Button
										variant="secondary"
										onClick={handleExport}
										disabled={isBusy || isHydrating}
									>
										Export CSV
									</Button>
									<Button variant="danger" onClick={handleClearCollection} disabled={isBusy}>
										Clear Collection
									</Button>
								</>
							)}
							<Button variant="primary" onClick={openModal} disabled={isBusy}>
								{isBusy ? 'Importing…' : 'Import'}
							</Button>
						</div>
					</div>

					{isImporting ? (
						<div className={styles.importingOverlay}>
							<div className={styles.spinner} />
							<p className={styles.importingText}>
								{status === 'fetching'
									? `Récupération des cartes…${progress.total > 0 ? ` (${progress.current}/${progress.total})` : ''}`
									: 'Ajout à la collection…'}
							</p>
						</div>
					) : entries.length === 0 ? (
						<div className={styles.emptyState}>
							<h2>Your collection is empty</h2>
							<p>Search for cards or import a collection file to get started.</p>
							<Link href="/search">
								<Button variant="primary">Search for cards</Button>
							</Link>
						</div>
					) : (
						<CardList
							cards={representativeCards}
							isLoading={isHydrating}
							skeletonCount={skeletonCount || undefined}
							hasMore={hasMore}
							onLoadMore={loadMore}
							onCardClick={(card) => {
								const stack = stackByCardId.get(card.id);
								if (stack) handleCardClick(stack);
							}}
							renderOverlay={(card) => {
								const stack = stackByCardId.get(card.id);
								const count = stack?.cards.length ?? 1;
								return (
									<>
										{count > 1 && <span className={styles.cardBadge}>x{count}</span>}
										<button
											type="button"
											className={`${styles.cardRemoveButton} ${cardListOverlayStyles.removeButton}`}
											onClick={(e) => {
												e.stopPropagation();
												decrementCard(card.id);
											}}
											aria-label={`Remove one ${card.name}`}
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 14 14"
												fill="none"
												aria-hidden="true"
											>
												<path
													d="M2 4h10M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M6 6.5v3M8 6.5v3M3 4l.5 7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L11 4"
													stroke="currentColor"
													strokeWidth="1.2"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										</button>
									</>
								);
							}}
							sortOrder={filters.order}
							sortDir={filters.dir}
							onSortChange={(newOrder, newDir) =>
								setFilters({
									...filters,
									order: newOrder as CollectionFilters['order'],
									dir: newDir,
								})
							}
							tableColumns={[
								{
									key: 'qty',
									label: 'Qté',
									render: (card) => stackByCardId.get(card.id)?.cards.length ?? 1,
								},
								{ key: 'name', label: 'Nom', sortKey: 'name' },
								{
									key: 'set',
									label: 'Set',
									sortKey: 'set',
									render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
								},
								{
									key: 'collector_number',
									label: 'Collector #',
									render: (card) =>
										'collector_number' in card ? (card.collector_number as string) : '—',
								},
								{
									key: 'condition',
									label: 'Condition',
									render: (card) => ('entry' in card ? (card.entry.condition ?? '—') : '—'),
								},
								{
									key: 'foil',
									label: 'Foil',
									render: (card) => ('entry' in card ? (card.entry.foilType ?? '—') : '—'),
								},
								{
									key: 'language',
									label: 'Langue',
									sortKey: 'language',
									render: (card) => ('entry' in card ? (card.entry.language ?? '—') : '—'),
								},
								{
									key: 'prices',
									label: 'Prix USD',
									sortKey: 'usd',
									render: (card) =>
										'prices' in card && card.prices && 'usd' in card.prices
											? (card.prices.usd ?? '—')
											: '—',
								},
							]}
						/>
					)}
				</main>
			</div>

			<ImportPreviewModal
				isOpen={status === 'selecting' || status === 'previewing'}
				preview={preview}
				formatRegistry={formatRegistry}
				fetchedCards={fetchedCards}
				isLoadingPreview={isLoadingPreview}
				sets={sets}
				setsLoading={setsLoading}
				onFileSelect={selectFile}
				onTextSubmit={submitText}
				onChangeFormat={changeFormat}
				onChangeFile={openModal}
				onConfirm={handleConfirmImport}
				onCancel={cancel}
				onUpdateRow={updateRow}
				onRemoveRow={removeRow}
			/>
			<CardCollectionModal
				stack={resolvedStack}
				onClose={handleCloseModal}
				onSave={handleSaveModal}
				onRemove={handleRemoveModal}
				onRemoveEntry={handleRemoveEntry}
				onDuplicate={handleDuplicateEntry}
				onIncrement={handleIncrementModal}
				onDecrement={handleDecrementModal}
				onChangePrint={handleChangePrint}
			/>
		</div>
	);
}
