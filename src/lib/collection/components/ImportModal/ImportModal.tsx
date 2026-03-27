'use client';

import { useEffect, type ReactNode } from 'react';
import type {
	ImportFormatId,
	ImportFormatDescriptor,
	ParsedImportRow,
} from '@/lib/import/utils/types';
import type { ImportPreview, ImportStatus, ImportProgress } from '@/lib/import/hooks/useImport';
import type { ScryfallCard, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useImportPreviewState } from './useImportPreviewState';
import { ImportFileInput } from './ImportFileInput';
import { ImportPreviewStats } from './ImportPreviewStats';
import { ImportPreviewFilters } from './ImportPreviewFilters';
import { ImportFallbackTable } from './ImportFallbackTable';
import { ImportSupportModals } from './ImportSupportModals';
import { CardList, type CardListColumn } from '@/components/ui/CardList/CardList';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import { Spinner } from '@/components/ui/Spinner/Spinner';
import styles from './ImportModal.module.css';
import { STATIC_IMPORT_COLUMNS } from './tableColumns';

interface Props {
	isOpen: boolean;
	status: ImportStatus;
	preview: ImportPreview | null;
	formatRegistry: ImportFormatDescriptor[];
	fetchedCards: ScryfallCard[];
	isLoadingPreview: boolean;
	previewProgress: ImportProgress;
	progress: ImportProgress;
	sets: ScryfallSet[];
	setsLoading: boolean;
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: (text: string, forcedFormat?: ImportFormatId) => void;
	onChangeFormat: (formatId: ImportFormatId) => void;
	onChangeFile: () => void;
	onConfirm: () => void;
	onCancel: () => void;
	onClose: () => void;
	onUpdateRow: (rowIndex: number, updates: Partial<ParsedImportRow>) => void;
	onRemoveRow: (rowIndex: number) => void;
}

function modalTitle(status: ImportStatus): string {
	switch (status) {
		case 'selecting':
			return 'Importer un fichier';
		case 'parsing':
			return 'Analyse du fichier…';
		case 'previewing':
			return "Aperçu de l'import";
		case 'fetching':
			return 'Récupération des cartes…';
		case 'merging':
			return 'Ajout à la collection…';
		default:
			return 'Importer un fichier';
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

export function ImportModal({
	isOpen,
	status,
	preview,
	formatRegistry,
	fetchedCards,
	isLoadingPreview,
	previewProgress,
	progress,
	sets,
	setsLoading,
	onFileSelect,
	onTextSubmit,
	onChangeFormat,
	onChangeFile,
	onConfirm,
	onCancel,
	onClose,
	onUpdateRow,
	onRemoveRow,
}: Props) {
	const state = useImportPreviewState({
		preview,
		fetchedCards,
		onFileSelect,
		onTextSubmit,
		onUpdateRow,
		onRemoveRow,
	});

	useEffect(() => {
		if (status === 'done' || status === 'error') onClose();
	}, [status, onClose]);

	if (!isOpen) return null;

	const isPreviewWide = status === 'previewing';

	const skeletonCount =
		fetchedCards.length === 0
			? 6
			: Math.min(PAGE_SIZE, Math.max(0, state.uniqueIdentifierCount - fetchedCards.length));
	const tableColumns: CardListColumn[] = [
		{ key: 'qty', label: 'Qté', render: (card) => state.rowMap.get(card.id)?.quantity ?? 1 },
		...STATIC_IMPORT_COLUMNS,
	];
	const renderOverlay = (card: { id: string }) => {
		const qty = state.rowMap.get(card.id)?.quantity ?? 1;
		return qty > 1 ? <span className={styles.gridBadge}>x{qty}</span> : null;
	};

	const previewProgressLabel =
		previewProgress.total > 0
			? `Récupération des cartes… (${previewProgress.current}/${previewProgress.total})`
			: 'Récupération des cartes…';

	const fetchProgressLabel =
		progress.total > 0
			? `Récupération des cartes… (${progress.current}/${progress.total})`
			: 'Récupération des cartes…';

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

		if (status === 'parsing') {
			return <LoadingScreen label="Analyse du fichier…" />;
		}

		if (status === 'previewing') {
			if (isLoadingPreview && fetchedCards.length === 0) {
				return (
					<LoadingScreen label={previewProgressLabel}>
						<Button variant="ghost" onClick={onCancel}>
							Annuler
						</Button>
						<Button variant="secondary" onClick={onChangeFile}>
							Changer de fichier
						</Button>
					</LoadingScreen>
				);
			}
			if (!preview) {
				return <LoadingScreen label="Récupération des cartes…" />;
			}
			if (preview) {
				return (
					<>
						<ImportPreviewStats
							preview={preview}
							formatRegistry={formatRegistry}
							errorsExpanded={state.errorsExpanded}
							onErrorsToggle={() => state.setErrorsExpanded((v) => !v)}
							onChangeFile={onChangeFile}
							onChangeFormat={onChangeFormat}
						/>
						<ImportPreviewFilters
							nameFilter={state.filters.name}
							onNameFilterChange={(value) => state.setFilters((prev) => ({ ...prev, name: value }))}
							activeFilterCount={state.activeFilterCount}
							onOpenFilterModal={() => state.setIsFilterModalOpen(true)}
							isFiltered={state.isFiltered}
							filteredCount={state.filteredCount}
							totalCardCount={state.totalCardCount}
						/>
						{state.filteredCards.length === 0 &&
							state.filteredRows.length > 0 &&
							!isLoadingPreview && <ImportFallbackTable rows={state.filteredRows} />}
						{(state.filteredCards.length > 0 || isLoadingPreview) && (
							<div className={styles.gridContainer}>
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
							</div>
						)}
						<div className={styles.actions}>
							<Button variant="ghost" onClick={onCancel}>
								Annuler
							</Button>
							<Button
								variant="primary"
								onClick={onConfirm}
								disabled={preview.parsed.rows.length === 0}
							>
								Confirmer l&apos;import
							</Button>
						</div>
					</>
				);
			}
		}

		if (status === 'fetching') {
			return <LoadingScreen label={fetchProgressLabel} />;
		}

		if (status === 'merging') {
			return <LoadingScreen label="Ajout à la collection…" />;
		}

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
