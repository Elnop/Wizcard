'use client';

import Link from 'next/link';
import { useCollectionPageState } from './useCollectionPageState';
import { CollectionGrid } from '@/components/collection/CollectionGrid';
import { CollectionFiltersAside } from '@/components/collection/CollectionFiltersAside';
import { ImportPreviewModal } from '@/components/collection/ImportPreviewModal';
import { CardCollectionModal } from '@/components/collection/CardCollectionModal';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export default function CollectionPage() {
	const {
		entries,
		isLoaded,
		filteredStacks,
		stats,
		isHydrating,
		totalExpected,
		filters,
		setFilters,
		sets,
		setsLoading,
		activeFilterCount,
		importCtx,
		resolvedStack,
		decrementCard,
		handleCardClick,
		handleCloseModal,
		handleSaveModal,
		handleRemoveModal,
		handleIncrementModal,
		handleDecrementModal,
		handleDuplicateEntry,
		handleRemoveEntry,
		handleChangePrint,
		handleClearCollection,
		handleExport,
		handleConfirmImport,
	} = useCollectionPageState();

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
						<CollectionGrid
							stacks={filteredStacks}
							onDecrement={decrementCard}
							onStackClick={handleCardClick}
							isLoading={isHydrating}
							totalExpected={totalExpected}
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
