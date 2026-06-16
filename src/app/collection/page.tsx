'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from './useCollectionCards';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { useCardModal } from '@/lib/card/hooks/useCardModal';
import { CollectionView } from './components/CollectionView/CollectionView';
import { ImportModal } from './components/ImportModal/ImportModal';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Button } from '@/components/Button/Button';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { ShareButton } from '@/components/ShareButton/ShareButton';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import styles from './page.module.css';

export default function CollectionPage() {
	const { user } = useAuth();
	const { entries, isLoaded, isFullyLoaded, clearCollection } = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const importCtx = useImportContext();
	const { sets, isLoading: setsLoading } = useScryfallSets();

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

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div className={styles.emptyState}>
			<h2>Your collection is empty</h2>
			<p>Search for cards or import a collection file to get started.</p>
			<Link href="/search">
				<Button variant="primary">Search for cards</Button>
			</Link>
		</div>
	);

	const actions = (
		<>
			{user && <ShareButton path={`/users/${user.id}/collection`} />}
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
		</>
	);

	return (
		<CollectionView
			stacks={stacks}
			entryCount={entries.length}
			isHydrating={isHydrating}
			totalExpected={totalExpected}
			isLoaded={isLoaded}
			isFullyLoaded={isFullyLoaded}
			title="My Collection"
			actions={actions}
			emptyState={emptyState}
			onCardClick={handleCardClick}
		>
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
		</CollectionView>
	);
}
