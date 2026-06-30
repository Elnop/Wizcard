'use client';

import { useEffect, type ReactNode } from 'react';
import type { ImportStatus } from '@/lib/import/hooks/useImport';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useImportContext } from '@/lib/import/context/ImportContext';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useImportPreviewState } from './hooks/useImportPreviewState';
import { ImportFileInput } from './components/ImportFileInput';
import { ImportPreviewStats } from './components/ImportPreviewStats';
import { ImportBulkApplyPanel } from './components/ImportBulkApplyPanel/ImportBulkApplyPanel';
import { ImportPreviewFilters } from './components/ImportPreviewFilters';
import { ImportFallbackTable } from './components/ImportFallbackTable';
import { ImportSupportModals } from './components/ImportSupportModals';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from './ImportModal.module.css';
import { STATIC_IMPORT_COLUMNS } from './tableColumns';

const TITLE_IMPORT_FILE = 'Import a file';
const LABEL_FETCHING_CARDS = 'Fetching cards…';

function modalTitle(status: ImportStatus): string {
	switch (status) {
		case 'selecting':
			return TITLE_IMPORT_FILE;
		case 'parsing':
			return 'Parsing the file…';
		case 'previewing':
			return 'Import preview';
		case 'fetching':
			return LABEL_FETCHING_CARDS;
		case 'merging':
			return 'Adding to collection…';
		default:
			return TITLE_IMPORT_FILE;
	}
}

function LoadingScreen({ label, children }: { label: string; children?: ReactNode }) {
	return (
		<div className={styles.loadingScreen}>
			<Spinner size="md" />
			<p className={styles.loadingLabel}>{label}</p>
			{children && <div className={styles.loadingActions}>{children}</div>}
		</div>
	);
}

/**
 * Smart component: owns its wiring to the import + Scryfall-sets state instead
 * of receiving ~20 props. `useScryfallSets` is deduped by the Scryfall store
 * (TTL guard), so consuming it here doesn't trigger an extra network fetch.
 */
export function ImportModal() {
	const {
		status,
		preview,
		resolved,
		formatRegistry,
		isLoadingPreview,
		previewProgress,
		progress,
		selectFile: onFileSelect,
		submitText: onTextSubmit,
		changeFormat: onChangeFormat,
		openModal: onChangeFile,
		confirm: onConfirm,
		cancel: onCancel,
		reset: onClose,
		updateCard: onUpdateCard,
		removeCard: onRemoveCard,
		applyToAll: onApplyToAll,
	} = useImportContext();
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const isOpen = status !== 'idle';

	const state = useImportPreviewState({
		preview,
		resolved,
		onFileSelect,
		onTextSubmit,
		onUpdateCard,
		onRemoveCard,
	});

	useEffect(() => {
		if (status === 'done' || status === 'error') onClose();
	}, [status, onClose]);

	if (!isOpen) return null;

	const isPreviewWide = status === 'previewing';

	const uniqueResolvedCount = state.uniqueCards.length;
	const skeletonCount =
		uniqueResolvedCount === 0
			? 6
			: Math.min(PAGE_SIZE, Math.max(0, state.uniqueIdentifierCount - uniqueResolvedCount));

	const tableColumns: CardListColumn[] = [
		{
			key: 'qty',
			label: 'Qty',
			render: (card) => state.getTotalQty((card as AnyCard & { id: string }).id),
		},
		...STATIC_IMPORT_COLUMNS,
	];
	const renderOverlay = (card: AnyCard) => {
		const qty = state.getTotalQty((card as AnyCard & { id: string }).id);
		return qty > 1 ? <span className={styles.gridBadge}>x{qty}</span> : null;
	};

	const previewProgressLabel =
		previewProgress.total > 0
			? `Fetching cards… (${previewProgress.current}/${previewProgress.total})`
			: LABEL_FETCHING_CARDS;

	const fetchProgressLabel =
		progress.total > 0
			? `Fetching cards… (${progress.current}/${progress.total})`
			: LABEL_FETCHING_CARDS;

	function renderPreviewBody() {
		if (isLoadingPreview && uniqueResolvedCount === 0) {
			return (
				<LoadingScreen label={previewProgressLabel}>
					<Button variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="secondary" onClick={onChangeFile}>
						Change file
					</Button>
				</LoadingScreen>
			);
		}
		if (!preview) return <LoadingScreen label={LABEL_FETCHING_CARDS} />;
		return (
			<div className={styles.previewLayout}>
				{/* Left column: meta + filters + not-found + actions */}
				<div className={styles.previewLeft}>
					<ImportPreviewStats
						preview={preview}
						formatRegistry={formatRegistry}
						errorsExpanded={state.errorsExpanded}
						onErrorsToggle={() => state.setErrorsExpanded((v) => !v)}
						onChangeFile={onChangeFile}
						onChangeFormat={onChangeFormat}
					/>
					{(resolved?.resolved.length ?? 0) > 0 && (
						<ImportBulkApplyPanel
							cardCount={resolved?.resolved.length ?? 0}
							onApplyToAll={onApplyToAll}
						/>
					)}
					{state.notFound.length > 0 && (
						<div className={styles.scrollArea}>
							<div className={styles.notFoundSection}>
								<p className={styles.notFoundLabel}>
									{state.uniqueNotFoundCount} print
									{state.uniqueNotFoundCount > 1 ? 's' : ''} not found on Scryfall (
									{state.notFound.length} cop{state.notFound.length > 1 ? 'ies' : 'y'})
								</p>
								<ImportFallbackTable rows={state.notFound} />
							</div>
						</div>
					)}
					<div className={styles.actions}>
						<Button variant="ghost" onClick={onCancel}>
							Cancel
						</Button>
						<Button
							variant="primary"
							onClick={onConfirm}
							disabled={!resolved || resolved.resolved.length === 0}
						>
							Confirm import
						</Button>
					</div>
				</div>
				{/* Right column: search/filters + card grid */}
				<div className={styles.previewRight}>
					<div className={styles.previewRightHeader}>
						<ImportPreviewFilters
							nameFilter={state.filters.name}
							onNameFilterChange={(value) => state.setFilters((prev) => ({ ...prev, name: value }))}
							activeFilterCount={state.activeFilterCount}
							onOpenFilterModal={() => state.setIsFilterModalOpen(true)}
							isFiltered={state.isFiltered}
							filteredCount={state.filteredCount}
							totalCardCount={state.totalCardCount}
						/>
					</div>
					<div className={styles.previewRightBody}>
						{state.filteredCards.length === 0 &&
							state.filteredRows.length > 0 &&
							!isLoadingPreview && <ImportFallbackTable rows={state.filteredRows} />}
						{(state.filteredCards.length > 0 || isLoadingPreview) && (
							<CardList
								cards={state.filteredCards}
								isLoading={isLoadingPreview && state.filteredCards.length === 0}
								isLoadingMore={isLoadingPreview && state.filteredCards.length > 0}
								skeletonCount={skeletonCount}
								cardsPerLine={4}
								onCardClick={(card) => state.setSelectedCardId(card.id)}
								renderOverlay={renderOverlay}
								tableColumns={tableColumns}
							/>
						)}
					</div>
				</div>
			</div>
		);
	}

	function renderContent() {
		if (status === 'selecting') {
			return (
				<ImportFileInput
					formatRegistry={formatRegistry}
					forcedFormat={state.forcedFormat}
					onForcedFormatChange={state.setForcedFormat}
					inputMode={state.inputMode}
					onInputModeChange={state.setInputMode}
					pastedText={state.pastedText}
					onPastedTextChange={state.setPastedText}
					isDragging={state.isDragging}
					onDragOver={state.handleDragOver}
					onDragLeave={state.handleDragLeave}
					onDrop={state.handleDrop}
					onFileSelect={onFileSelect}
					onTextSubmit={state.handleTextSubmit}
					onCancel={onCancel}
				/>
			);
		}
		if (status === 'parsing') return <LoadingScreen label="Parsing the file…" />;
		if (status === 'previewing') return renderPreviewBody();
		if (status === 'fetching') return <LoadingScreen label={fetchProgressLabel} />;
		if (status === 'merging') return <LoadingScreen label="Adding to collection…" />;
		return null;
	}

	return (
		<Modal className={`${styles.modal} ${isPreviewWide ? styles.modalWide : ''}`}>
			<h2 className={styles.title}>{modalTitle(status)}</h2>
			{renderContent()}
			<ImportSupportModals state={state} sets={sets} setsLoading={setsLoading} />
		</Modal>
	);
}
