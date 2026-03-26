'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import type { ImportFormatId, ImportFormatDescriptor, ParsedImportRow } from '@/lib/import/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';
import type { ScryfallCard, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import type { Card, CardEntry, CardStack } from '@/types/cards';
import { filterCollectionCards, defaultCollectionFilters } from '../../utils/filterCollectionCards';
import type { CollectionFilters } from '../../utils/filterCollectionCards';
import type { ScryfallSortOrder } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterModal } from '@/components/search/FilterModal';
import { CardCollectionModal } from '../../CardCollectionModal/CardCollectionModal';
import { CardList } from '@/components/ui/CardList';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import styles from './ImportPreviewModal.module.css';

type InputMode = 'file' | 'text';

const PAGE_SIZE = 48; // used for skeleton count calculation

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

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
	const [isDragging, setIsDragging] = useState(false);
	const [errorsExpanded, setErrorsExpanded] = useState(false);
	const [inputMode, setInputMode] = useState<InputMode>('file');
	const [pastedText, setPastedText] = useState('');
	const [forcedFormat, setForcedFormat] = useState<ImportFormatId | 'auto'>('auto');
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
	const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

	// Filter out fetched cards whose row was removed
	const activeCards = useMemo(() => {
		if (!preview) return fetchedCards;
		return fetchedCards.filter((card) => {
			const setKey = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
			return preview.parsed.rows.some((r) =>
				r.set && r.collectorNumber
					? `${r.set.toLowerCase()}/${r.collectorNumber.toLowerCase()}` === setKey
					: r.name.toLowerCase() === card.name.toLowerCase()
			);
		});
	}, [fetchedCards, preview]);

	const filteredCards = useMemo(
		() => filterCollectionCards(activeCards, filters),
		[activeCards, filters]
	);

	const activeFilterCount =
		filters.colors.length +
		(filters.type ? 1 : 0) +
		(filters.set ? 1 : 0) +
		(filters.order !== 'name' || filters.dir !== 'auto' ? 1 : 0) +
		filters.rarities.length +
		(filters.oracleText ? 1 : 0) +
		(filters.cmc ? 1 : 0);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			const file = e.dataTransfer.files[0];
			if (file) onFileSelect(file, forcedFormat !== 'auto' ? forcedFormat : undefined);
		},
		[onFileSelect, forcedFormat]
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) onFileSelect(file, forcedFormat !== 'auto' ? forcedFormat : undefined);
			e.target.value = '';
		},
		[onFileSelect, forcedFormat]
	);

	// --- Card → row mapping (rows are already deduplicated by mergeRows) ---
	const rowMap = useMemo(() => {
		if (!preview) return new Map<string, ParsedImportRow>();
		const map = new Map<string, ParsedImportRow>();
		for (const card of fetchedCards) {
			const setKey = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
			const row = preview.parsed.rows.find((r) =>
				r.set && r.collectorNumber
					? `${r.set.toLowerCase()}/${r.collectorNumber.toLowerCase()}` === setKey
					: r.name.toLowerCase() === card.name.toLowerCase()
			);
			if (row) map.set(card.id, row);
		}
		return map;
	}, [preview, fetchedCards]);

	const selectedImportCard: Card | null = (() => {
		if (!selectedCardId || !preview) return null;
		const scryfallCard = fetchedCards.find((c) => c.id === selectedCardId);
		if (!scryfallCard) return null;
		const row = rowMap.get(selectedCardId);
		if (!row) return null;
		const entry: CardEntry = {
			rowId: selectedCardId, // temporary — import preview only
			dateAdded: new Date().toISOString(),
			isFoil: !!row.foil,
			foilType: row.foil || undefined,
			condition: row.condition as CardEntry['condition'],
			language: row.language as CardEntry['language'],
			tags: row.tags,
		};
		return { ...scryfallCard, entry };
	})();

	const selectedImportStack: CardStack | null = selectedImportCard
		? {
				oracleId: selectedImportCard.oracle_id,
				name: selectedImportCard.name,
				cards: [selectedImportCard],
			}
		: null;

	function handleEditSave(rowId: string, updates: Partial<CardEntry>) {
		if (!preview) return;
		// rowId here is the scryfallCard.id used as temporary rowId in preview
		const row = rowMap.get(rowId);
		if (!row) return;
		const rowIndex = preview.parsed.rows.indexOf(row);
		if (rowIndex === -1) return;
		const rowUpdates: Partial<ParsedImportRow> = {};
		if (updates.isFoil !== undefined || updates.foilType !== undefined) {
			rowUpdates.foil = updates.isFoil ? ((updates.foilType ?? 'foil') as 'foil' | 'etched') : '';
		}
		if (updates.condition !== undefined) rowUpdates.condition = updates.condition;
		if (updates.language !== undefined) rowUpdates.language = updates.language;
		if (updates.tags !== undefined) rowUpdates.tags = updates.tags;
		onUpdateRow(rowIndex, rowUpdates);
	}

	function handleEditRemove(scryfallId: string) {
		if (!preview) return;
		const row = rowMap.get(scryfallId);
		if (!row) return;
		const rowIndex = preview.parsed.rows.indexOf(row);
		if (rowIndex === -1) return;
		onRemoveRow(rowIndex);
		setSelectedCardId(null);
	}

	if (!isOpen) return null;

	const errorCount = preview?.parsed.parseErrors.length ?? 0;
	const manyErrors = errorCount > 5;

	// Deduplicated identifier count for skeleton placeholders
	const uniqueIdentifierCount = preview
		? new Set(
				preview.parsed.identifiers.map((id) =>
					id.set && id.collector_number
						? `${id.set}/${id.collector_number}`
						: `name:${id.name ?? ''}`
				)
			).size
		: 0;

	// Filter parsed rows for table fallback (before Scryfall fetch completes)
	const filteredRows = preview
		? filters.name
			? preview.parsed.rows.filter((row) =>
					row.name.toLowerCase().includes(filters.name.toLowerCase())
				)
			: preview.parsed.rows
		: [];

	const isFiltered = filters.name || activeFilterCount > 0;
	const totalCardCount =
		activeCards.length > 0 ? activeCards.length : (preview?.parsed.rows.length ?? 0);

	return (
		<Modal className={`${styles.modal} ${preview ? styles.modalWide : ''}`}>
			<h2 className={styles.title}>Importer un fichier</h2>

			{!preview ? (
				<>
					<div className={styles.formatRow}>
						<label className={styles.formatLabel} htmlFor="format-select">
							Format :
						</label>
						<select
							id="format-select"
							className={styles.formatSelect}
							value={forcedFormat}
							onChange={(e) => setForcedFormat(e.target.value as ImportFormatId | 'auto')}
						>
							<option value="auto">Auto-détection</option>
							{formatRegistry.map((f) => (
								<option key={f.id} value={f.id}>
									{f.label}
								</option>
							))}
						</select>
					</div>

					<div className={styles.tabs}>
						<button
							className={`${styles.tab} ${inputMode === 'file' ? styles.tabActive : ''}`}
							onClick={() => setInputMode('file')}
						>
							Fichier
						</button>
						<button
							className={`${styles.tab} ${inputMode === 'text' ? styles.tabActive : ''}`}
							onClick={() => setInputMode('text')}
						>
							Coller du texte
						</button>
					</div>

					{inputMode === 'file' ? (
						<>
							<div
								className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''}`}
								onDragOver={handleDragOver}
								onDragLeave={handleDragLeave}
								onDrop={handleDrop}
								onClick={() => fileInputRef.current?.click()}
							>
								<span className={styles.dropText}>
									Glissez un fichier ici ou cliquez pour parcourir
								</span>
								<span className={styles.dropHint}>.csv, .txt</span>
							</div>
							<input
								ref={fileInputRef}
								type="file"
								accept=".csv,.txt"
								className={styles.hiddenInput}
								onChange={handleFileChange}
							/>
						</>
					) : (
						<textarea
							className={styles.textarea}
							placeholder={'4 Lightning Bolt (M11) 149\n2 Counterspell (MH2) 267\n...'}
							value={pastedText}
							onChange={(e) => setPastedText(e.target.value)}
							rows={8}
						/>
					)}

					<div className={styles.actions}>
						{inputMode === 'text' && (
							<Button
								variant="primary"
								onClick={() =>
									onTextSubmit(pastedText, forcedFormat !== 'auto' ? forcedFormat : undefined)
								}
								disabled={!pastedText.trim()}
							>
								Analyser
							</Button>
						)}
						<Button variant="ghost" onClick={onCancel}>
							Annuler
						</Button>
					</div>
				</>
			) : (
				<>
					<div className={styles.fileInfo} onClick={onChangeFile}>
						<span className={styles.fileName}>{preview.fileName}</span>
						<span className={styles.fileSize}>{formatFileSize(preview.fileSize)}</span>
						<span className={styles.fileInfoOverlay}>Changer de fichier</span>
					</div>

					<div className={styles.formatRow}>
						<span className={styles.formatLabel}>Format :</span>
						<select
							className={styles.formatSelect}
							value={preview.detectedFormat}
							onChange={(e) => onChangeFormat(e.target.value as ImportFormatId)}
						>
							{formatRegistry.map((f) => (
								<option key={f.id} value={f.id}>
									{f.label}
								</option>
							))}
						</select>
					</div>

					<div className={styles.previewStats}>
						<span className={styles.previewStat}>
							<span className={styles.previewStatValue}>
								{preview.parsed.rows.reduce((sum, r) => sum + r.quantity, 0)}
							</span>{' '}
							cartes détectées
						</span>
						{errorCount > 0 && (
							<span className={styles.previewStat}>
								<span className={styles.previewStatWarn}>{errorCount}</span> erreurs d&apos;analyse
							</span>
						)}
					</div>

					{errorCount > 0 && (
						<div className={styles.errors}>
							<button className={styles.errorToggle} onClick={() => setErrorsExpanded((v) => !v)}>
								{errorCount} erreur{errorCount !== 1 ? 's' : ''}
								{manyErrors ? (errorsExpanded ? ' ▲' : ' ▼') : ''}
							</button>
							{(!manyErrors || errorsExpanded) && (
								<ul className={styles.errorList}>
									{preview.parsed.parseErrors.map((e, i) => (
										<li key={i}>{e}</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Search + filter row */}
					<div className={styles.searchRow}>
						<SearchBar
							value={filters.name}
							onChange={(value) => setFilters((prev) => ({ ...prev, name: value }))}
							placeholder="Rechercher par nom..."
						/>
						<button className={styles.filterButton} onClick={() => setIsFilterModalOpen(true)}>
							Filtres
							{activeFilterCount > 0 && (
								<span className={styles.filterBadge}>{activeFilterCount}</span>
							)}
						</button>
					</div>

					{isFiltered && (
						<span className={styles.resultCount}>
							{filteredCards.length > 0
								? `${filteredCards.length} carte${filteredCards.length !== 1 ? 's' : ''}`
								: filteredRows.length > 0
									? `${filteredRows.length} carte${filteredRows.length !== 1 ? 's' : ''}`
									: 'Aucun résultat'}
							{totalCardCount > 0 && ` / ${totalCardCount}`}
						</span>
					)}

					{/* Table fallback: show parsed rows before Scryfall fetch */}
					{filteredCards.length === 0 && filteredRows.length > 0 && (
						<div className={styles.tableContainer}>
							<table className={styles.previewTable}>
								<thead>
									<tr>
										<th>Qté</th>
										<th>Nom</th>
										<th>Set</th>
										<th>Collector #</th>
									</tr>
								</thead>
								<tbody>
									{filteredRows.map((row, i) => (
										<tr key={i}>
											<td>{row.quantity}</td>
											<td>{row.name}</td>
											<td>{row.set?.toUpperCase() || '—'}</td>
											<td>{row.collectorNumber || '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{/* CardList: grid or table once Scryfall cards are available */}
					{(filteredCards.length > 0 || isLoadingPreview) && (
						<div className={styles.gridContainer}>
							<CardList
								cards={filteredCards}
								isLoading={isLoadingPreview && filteredCards.length === 0}
								skeletonCount={
									fetchedCards.length === 0
										? 6
										: Math.min(PAGE_SIZE, Math.max(0, uniqueIdentifierCount - fetchedCards.length))
								}
								cardsPerLine={4}
								onCardClick={(card) => setSelectedCardId(card.id)}
								renderOverlay={(card) => {
									const qty = rowMap.get(card.id)?.quantity ?? 1;
									return qty > 1 ? <span className={styles.gridBadge}>x{qty}</span> : null;
								}}
								tableColumns={[
									{
										key: 'qty',
										label: 'Qté',
										render: (card) => rowMap.get(card.id)?.quantity ?? 1,
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
				isOpen={isFilterModalOpen}
				colors={filters.colors}
				colorMatch={filters.colorMatch}
				type={filters.type}
				set={filters.set}
				rarities={filters.rarities}
				oracleText={filters.oracleText}
				cmc={filters.cmc}
				sets={sets}
				setsLoading={setsLoading}
				order={filters.order as ScryfallSortOrder}
				dir={filters.dir}
				onApply={(applied) => setFilters((prev) => ({ ...prev, ...applied }) as CollectionFilters)}
				onClose={() => setIsFilterModalOpen(false)}
			/>
			<CardCollectionModal
				stack={selectedImportStack}
				onClose={() => setSelectedCardId(null)}
				onSave={handleEditSave}
				onRemove={handleEditRemove}
				onRemoveEntry={() => {}}
			/>
		</Modal>
	);
}
