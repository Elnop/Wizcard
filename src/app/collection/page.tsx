'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { CardStack } from '@/types/cards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from './useCollectionCards';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useCollectionFiltering } from './useCollectionFiltering';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useCardModal } from '@/lib/card/hooks/useCardModal';
import { CollectionFiltersAside } from './components/CollectionFiltersAside/CollectionFiltersAside';
import { ImportModal } from './components/ImportModal/ImportModal';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { Button } from '@/components/Button/Button';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import styles from './page.module.css';

export default function CollectionPage() {
	const { entries, isLoaded, isFullyLoaded, clearCollection } = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const importCtx = useImportContext();

	// La collection se charge en deux étapes progressives : les entries arrivent
	// page par page (Supabase), puis chaque carte est hydratée depuis Scryfall.
	// On considère le chargement terminé seulement quand les DEUX sont finis,
	// sinon la grille révélée continuerait de pousser des cartes au milieu.
	const isLoadingCollection = !isFullyLoaded || isHydrating;

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
	} = useCardModal(stacks);

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
	}, [importCtx]);

	// Pendant le chargement on gèle la grille sur des skeletons : on n'affiche
	// pas les vraies cartes tant que tout n'est pas chargé/trié, sinon les cartes
	// sautent à mesure que les données arrivent. On révèle la grille triée finale
	// en une seule fois quand isLoadingCollection passe à false.
	const skeletonCount = isLoadingCollection
		? Math.min(PAGE_SIZE, Math.max(1, totalExpected ?? PAGE_SIZE))
		: 0;

	const representativeCards = useMemo(
		() =>
			filteredStacks
				.map((stack) => stack.cards[0])
				.filter((c): c is NonNullable<typeof c> => c !== undefined),
		[filteredStacks]
	);

	const stackByCardId = useMemo(() => {
		const map = new Map<string, CardStack>();
		for (const stack of filteredStacks) {
			const rep = stack.cards[0];
			if (rep) map.set(rep.id, stack);
		}
		return map;
	}, [filteredStacks]);

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

	const {
		status,
		progress,
		preview,
		resolved,
		isLoadingPreview,
		previewProgress,
		openModal,
		selectFile,
		submitText,
		changeFormat,
		cancel,
		reset,
		updateCard,
		removeCard,
		formatRegistry,
	} = importCtx;
	const isBusy =
		status === 'parsing' ||
		status === 'previewing' ||
		status === 'fetching' ||
		status === 'merging';

	let collectionBody: React.ReactNode;
	if (entries.length === 0) {
		collectionBody = (
			<div className={styles.emptyState}>
				<h2>Your collection is empty</h2>
				<p>Search for cards or import a collection file to get started.</p>
				<Link href="/search">
					<Button variant="primary">Search for cards</Button>
				</Link>
			</div>
		);
	} else if (isLoadingCollection) {
		// Grille gelée sur des skeletons pendant le chargement : on ne révèle les
		// vraies cartes qu'une fois tout chargé et trié (sinon elles sautent).
		collectionBody = (
			<CardList
				cards={[]}
				isLoading
				skeletonCount={skeletonCount || undefined}
				viewModes={['grid']}
			/>
		);
	} else {
		collectionBody = (
			<CardList
				cards={representativeCards}
				isLoading={false}
				onCardClick={(card) => {
					const stack = stackByCardId.get(card.id);
					if (stack) handleCardClick(stack);
				}}
				renderOverlay={(card) => {
					const stack = stackByCardId.get(card.id);
					const count = stack?.cards.length ?? 1;
					const countBadge =
						count > 1 ? <span className={styles.cardBadge}>x{count}</span> : undefined;
					return withCustomBadge(card, countBadge);
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
		);
	}

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
							{entries.length > 0 && !isLoadingCollection && (
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
										disabled={isBusy || isLoadingCollection}
									>
										Export CSV
									</Button>
									<Button variant="danger" onClick={handleClearCollection} disabled={isBusy}>
										Clear
									</Button>
								</>
							)}
							<Button variant="primary" onClick={openModal} disabled={isBusy}>
								{isBusy ? 'Importing…' : 'Import'}
							</Button>
						</div>
					</div>

					{collectionBody}
				</main>
			</div>

			<ImportModal
				isOpen={status !== 'idle'}
				status={status}
				preview={preview}
				resolved={resolved}
				formatRegistry={formatRegistry}
				isLoadingPreview={isLoadingPreview}
				previewProgress={previewProgress}
				progress={progress}
				sets={sets}
				setsLoading={setsLoading}
				onFileSelect={selectFile}
				onTextSubmit={submitText}
				onChangeFormat={changeFormat}
				onChangeFile={openModal}
				onConfirm={handleConfirmImport}
				onCancel={cancel}
				onClose={reset}
				onUpdateCard={updateCard}
				onRemoveCard={removeCard}
			/>
			<CardModal
				cards={resolvedStack?.cards ?? null}
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
