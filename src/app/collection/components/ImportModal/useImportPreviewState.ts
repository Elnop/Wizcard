'use client';

import { useState, useCallback, useMemo } from 'react';
import type { ImportFormatId, ParsedImportRow } from '@/lib/import/utils/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry, CardStack, Card } from '@/types/cards';
import {
	filterCollectionCards,
	defaultCollectionFilters,
} from '@/app/collection/utils/filterCollectionCards';
import type { CollectionFilters } from '@/app/collection/utils/filterCollectionCards';
import { countActiveFilters } from '@/lib/search/types';
import { buildIdentifierKey } from '@/lib/import/utils/identifier-dedup';
import type { InputMode } from './types';

interface UseImportPreviewStateProps {
	preview: ImportPreview | null;
	fetchedCards: ScryfallCard[];
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: (text: string, forcedFormat?: ImportFormatId) => void;
	onUpdateRow: (rowIndex: number, updates: Partial<ParsedImportRow>) => void;
	onRemoveRow: (rowIndex: number) => void;
}

export function useImportPreviewState({
	preview,
	fetchedCards,
	onFileSelect,
	onTextSubmit,
	onUpdateRow,
	onRemoveRow,
}: UseImportPreviewStateProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [errorsExpanded, setErrorsExpanded] = useState(false);
	const [inputMode, setInputMode] = useState<InputMode>('file');
	const [pastedText, setPastedText] = useState('');
	const [forcedFormat, setForcedFormat] = useState<ImportFormatId | 'auto'>('auto');
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
	const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

	// Drag handlers
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

	const handleTextSubmit = useCallback(() => {
		onTextSubmit(pastedText, forcedFormat !== 'auto' ? forcedFormat : undefined);
	}, [onTextSubmit, pastedText, forcedFormat]);

	// Filter out fetched cards whose row was removed
	const activeCards = useMemo(() => {
		if (!preview) return fetchedCards;
		return fetchedCards.filter((card) => {
			const cardKey = buildIdentifierKey({
				set: card.set,
				collector_number: card.collector_number,
			});
			return preview.parsed.rows.some((r) =>
				r.set && r.collectorNumber
					? buildIdentifierKey({ set: r.set, collector_number: r.collectorNumber }) === cardKey
					: r.name.toLowerCase() === card.name.toLowerCase()
			);
		});
	}, [fetchedCards, preview]);

	const filteredCards = useMemo(
		() => filterCollectionCards(activeCards, filters),
		[activeCards, filters]
	);

	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	// Card → row mapping
	const rowMap = useMemo(() => {
		if (!preview) return new Map<string, ParsedImportRow>();
		const map = new Map<string, ParsedImportRow>();
		for (const card of fetchedCards) {
			const cardKey = buildIdentifierKey({
				set: card.set,
				collector_number: card.collector_number,
			});
			const row = preview.parsed.rows.find((r) =>
				r.set && r.collectorNumber
					? buildIdentifierKey({ set: r.set, collector_number: r.collectorNumber }) === cardKey
					: r.name.toLowerCase() === card.name.toLowerCase()
			);
			if (row) map.set(card.id, row);
		}
		return map;
	}, [preview, fetchedCards]);

	const selectedImportCard = useMemo((): Card | null => {
		if (!selectedCardId || !preview) return null;
		const scryfallCard = fetchedCards.find((c) => c.id === selectedCardId);
		if (!scryfallCard) return null;
		const row = rowMap.get(selectedCardId);
		if (!row) return null;
		const entry: CardEntry = {
			rowId: selectedCardId,
			dateAdded: new Date().toISOString(),
			isFoil: !!row.foil,
			foilType: row.foil || undefined,
			condition: row.condition as CardEntry['condition'],
			language: row.language as CardEntry['language'],
			tags: row.tags,
		};
		return { ...scryfallCard, entry };
	}, [selectedCardId, preview, fetchedCards, rowMap]);

	const selectedImportStack = useMemo((): CardStack | null => {
		if (!selectedImportCard) return null;
		return {
			oracleId: selectedImportCard.oracle_id,
			name: selectedImportCard.name,
			cards: [selectedImportCard],
		};
	}, [selectedImportCard]);

	// Deduplicated identifier count for skeleton placeholders
	const uniqueIdentifierCount = useMemo(() => {
		if (!preview) return 0;
		return new Set(preview.parsed.identifiers.map((id) => buildIdentifierKey(id))).size;
	}, [preview]);

	// Rows filtered by name only (for fallback table before Scryfall fetch)
	const filteredRows = useMemo(() => {
		if (!preview) return [];
		if (!filters.name) return preview.parsed.rows;
		return preview.parsed.rows.filter((row) =>
			row.name.toLowerCase().includes(filters.name.toLowerCase())
		);
	}, [preview, filters.name]);

	const isFiltered = !!(filters.name || activeFilterCount > 0);
	const totalCardCount =
		activeCards.length > 0 ? activeCards.length : (preview?.parsed.rows.length ?? 0);

	// The displayed count for ImportPreviewFilters
	const filteredCount = filteredCards.length > 0 ? filteredCards.length : filteredRows.length;

	function handleEditSave(rowId: string, updates: Partial<CardEntry>) {
		if (!preview) return;
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

	return {
		// State
		isDragging,
		errorsExpanded,
		setErrorsExpanded,
		inputMode,
		setInputMode,
		pastedText,
		setPastedText,
		forcedFormat,
		setForcedFormat,
		filters,
		setFilters,
		isFilterModalOpen,
		setIsFilterModalOpen,
		selectedCardId,
		setSelectedCardId,
		// Derived
		activeCards,
		filteredCards,
		activeFilterCount,
		rowMap,
		selectedImportCard,
		selectedImportStack,
		uniqueIdentifierCount,
		filteredRows,
		isFiltered,
		totalCardCount,
		filteredCount,
		// Handlers
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handleTextSubmit,
		handleEditSave,
		handleEditRemove,
	};
}
