'use client';

import type {
	ImportFormatId,
	ImportFormatDescriptor,
	ParsedImportRow,
} from '@/lib/import/utils/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';
import type { ScryfallCard, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import type { CollectionFilters } from '../../utils/filterCollectionCards';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useImportPreviewState } from './useImportPreviewState';
import { ImportFileInput } from './ImportFileInput';
import { ImportPreviewStats } from './ImportPreviewStats';
import { ImportPreviewFilters } from './ImportPreviewFilters';
import { ImportFallbackTable } from './ImportFallbackTable';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardCollectionModal } from '../../CardCollectionModal/CardCollectionModal';
import { CardList } from '@/components/ui/CardList/CardList';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import styles from './ImportPreviewModal.module.css';

interface Props {
	isOpen: boolean;
	preview: ImportPreview | null;
	formatRegistry: ImportFormatDescriptor[];
	fetchedCards: ScryfallCard[];
	isLoadingPreview: boolean;
	sets: ScryfallSet[];
	setsLoading: boolean;
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: (text: string, forcedFormat?: ImportFormatId) => void;
	onChangeFormat: (formatId: ImportFormatId) => void;
	onChangeFile: () => void;
	onConfirm: () => void;
	onCancel: () => void;
	onUpdateRow: (rowIndex: number, updates: Partial<ParsedImportRow>) => void;
	onRemoveRow: (rowIndex: number) => void;
}

export function ImportPreviewModal({
	isOpen,
	preview,
	formatRegistry,
	fetchedCards,
	isLoadingPreview,
	sets,
	setsLoading,
	onFileSelect,
	onTextSubmit,
	onChangeFormat,
	onChangeFile,
	onConfirm,
	onCancel,
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

	if (!isOpen) return null;

	return (
		<Modal className={`${styles.modal} ${preview ? styles.modalWide : ''}`}>
			<h2 className={styles.title}>Importer un fichier</h2>

			{!preview ? (
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
			) : (
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
								skeletonCount={
									fetchedCards.length === 0
										? 6
										: Math.min(
												PAGE_SIZE,
												Math.max(0, state.uniqueIdentifierCount - fetchedCards.length)
											)
								}
								cardsPerLine={4}
								onCardClick={(card) => state.setSelectedCardId(card.id)}
								renderOverlay={(card) => {
									const qty = state.rowMap.get(card.id)?.quantity ?? 1;
									return qty > 1 ? <span className={styles.gridBadge}>x{qty}</span> : null;
								}}
								tableColumns={[
									{
										key: 'qty',
										label: 'Qté',
										render: (card) => state.rowMap.get(card.id)?.quantity ?? 1,
									},
									{ key: 'name', label: 'Nom' },
									{
										key: 'set',
										label: 'Set',
										render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
									},
									{
										key: 'collector_number',
										label: 'Collector #',
										render: (card) =>
											'collector_number' in card ? (card.collector_number as string) : '—',
									},
								]}
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
			)}

			<FilterModal
				isOpen={state.isFilterModalOpen}
				colors={state.filters.colors}
				colorMatch={state.filters.colorMatch}
				type={state.filters.type}
				set={state.filters.set}
				rarities={state.filters.rarities}
				oracleText={state.filters.oracleText}
				cmc={state.filters.cmc}
				sets={sets}
				setsLoading={setsLoading}
				order={state.filters.order as ScryfallSortOrder}
				dir={state.filters.dir}
				onApply={(applied) =>
					state.setFilters((prev) => ({ ...prev, ...applied }) as CollectionFilters)
				}
				onClose={() => state.setIsFilterModalOpen(false)}
			/>
			<CardCollectionModal
				stack={state.selectedImportStack}
				onClose={() => state.setSelectedCardId(null)}
				onSave={state.handleEditSave}
				onRemove={state.handleEditRemove}
				onRemoveEntry={() => {}}
			/>
		</Modal>
	);
}
