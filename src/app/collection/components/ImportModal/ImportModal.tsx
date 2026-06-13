'use client';

import { useEffect, type ReactNode } from 'react';
import type { ImportFormatId } from '@/lib/import/types';
import type { ResolvedImportResult } from '@/lib/import/types';
import type { ImportPreview, ImportStatus, ImportProgress } from '@/lib/import/hooks/useImport';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardEntry } from '@/types/cards';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useImportPreviewState } from './useImportPreviewState';
import { ImportFileInput } from './ImportFileInput';
import { ImportPreviewStats } from './ImportPreviewStats';
import { ImportPreviewFilters } from './ImportPreviewFilters';
import { ImportFallbackTable } from './ImportFallbackTable';
import { ImportSupportModals } from './ImportSupportModals';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from './ImportModal.module.css';
import { STATIC_IMPORT_COLUMNS } from './tableColumns';

interface Props {
	isOpen: boolean;
	status: ImportStatus;
	preview: ImportPreview | null;
	resolved: ResolvedImportResult | null;
	formatRegistry: Array<{ id: ImportFormatId; label: string }>;
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
	onUpdateCard: (cardIndex: number, updates: Partial<CardEntry>) => void;
	onRemoveCard: (cardIndex: number) => void;
}

const TITLE_IMPORT_FILE = 'Importer un fichier';
const LABEL_FETCHING_CARDS = 'Récupération des cartes…';

function modalTitle(status: ImportStatus): string {
	switch (status) {
		case 'selecting':
			return TITLE_IMPORT_FILE;
		case 'parsing':
			return 'Analyse du fichier…';
		case 'previewing':
			return "Aperçu de l'import";
		case 'fetching':
			return LABEL_FETCHING_CARDS;
		case 'merging':
			return 'Ajout à la collection…';
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

export function ImportModal({
	isOpen,
	status,
	preview,
	resolved,
	formatRegistry,
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
	onUpdateCard,
	onRemoveCard,
}: Props) {
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
			label: 'Qté',
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
			? `Récupération des cartes… (${previewProgress.current}/${previewProgress.total})`
			: LABEL_FETCHING_CARDS;

	const fetchProgressLabel =
		progress.total > 0
			? `Récupération des cartes… (${progress.current}/${progress.total})`
			: LABEL_FETCHING_CARDS;

	function renderPreviewBody() {
		if (isLoadingPreview && uniqueResolvedCount === 0) {
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
					<ImportPreviewFilters
						nameFilter={state.filters.name}
						onNameFilterChange={(value) => state.setFilters((prev) => ({ ...prev, name: value }))}
						activeFilterCount={state.activeFilterCount}
						onOpenFilterModal={() => state.setIsFilterModalOpen(true)}
						isFiltered={state.isFiltered}
						filteredCount={state.filteredCount}
						totalCardCount={state.totalCardCount}
					/>
					{state.notFound.length > 0 && (
						<div className={styles.scrollArea}>
							<div className={styles.notFoundSection}>
								<p className={styles.notFoundLabel}>
									{state.uniqueNotFoundCount} print
									{state.uniqueNotFoundCount > 1 ? 's' : ''} non trouvé
									{state.uniqueNotFoundCount > 1 ? 's' : ''} sur Scryfall ({state.notFound.length}{' '}
									cop{state.notFound.length > 1 ? 'ies' : 'ie'})
								</p>
								<ImportFallbackTable rows={state.notFound} />
							</div>
						</div>
					)}
					<div className={styles.actions}>
						<Button variant="ghost" onClick={onCancel}>
							Annuler
						</Button>
						<Button
							variant="primary"
							onClick={onConfirm}
							disabled={!resolved || resolved.resolved.length === 0}
						>
							Confirmer l&apos;import
						</Button>
					</div>
				</div>
				{/* Right column: card grid */}
				<div className={styles.previewRight}>
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
		if (status === 'parsing') return <LoadingScreen label="Analyse du fichier…" />;
		if (status === 'previewing') return renderPreviewBody();
		if (status === 'fetching') return <LoadingScreen label={fetchProgressLabel} />;
		if (status === 'merging') return <LoadingScreen label="Ajout à la collection…" />;
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
