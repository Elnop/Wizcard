'use client';

import { useState, useCallback, useMemo } from 'react';
import type { ImportFormatId, ResolvedImportResult } from '@/lib/import/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';
import type { Card, CardEntry, CardStack } from '@/types/cards';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import { groupByOracleId, filterStacks, cardGroupKey } from '@/lib/card/utils/group-cards';
import { countActiveFilters } from '@/lib/search/types';
import type { InputMode } from './types';

interface UseImportPreviewStateProps {
	preview: ImportPreview | null;
	resolved: ResolvedImportResult | null;
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: (text: string, forcedFormat?: ImportFormatId) => void;
	onUpdateCard: (cardIndex: number, updates: Partial<CardEntry>) => void;
	onRemoveCard: (cardIndex: number) => void;
}

export function useImportPreviewState({
	preview,
	resolved,
	onFileSelect,
	onTextSubmit,
	onUpdateCard,
	onRemoveCard,
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

	// All resolved cards (one entry per physical copy)
	const activeCards = useMemo((): Card[] => resolved?.resolved ?? [], [resolved]);

	// Group copies into stacks by oracle_id — the same logic the collection uses,
	// so grouping, representative-print choice and filtering stay consistent.
	const stacks = useMemo(() => groupByOracleId(activeCards), [activeCards]);
	const filteredStacks = useMemo(() => filterStacks(stacks, filters), [stacks, filters]);

	// Representative print of each (filtered) stack — what the grid/table renders.
	const uniqueCards = useMemo(() => stacks.map((s) => s.cards[0]).filter(Boolean), [stacks]);
	const filteredCards = useMemo(
		() => filteredStacks.map((s) => s.cards[0]).filter(Boolean),
		[filteredStacks]
	);

	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	// Map a representative print id (what the grid emits on click) to its stack.
	const stackByRepId = useMemo(() => {
		const m = new Map<string, CardStack>();
		for (const s of stacks) {
			const rep = s.cards[0];
			if (rep) m.set(rep.id, s);
		}
		return m;
	}, [stacks]);

	// Stack for the detail modal — all copies of the selected logical card, so the
	// modal shows every edition/foil/language imported.
	const selectedImportStack = useMemo((): CardStack | null => {
		if (!selectedCardId) return null;
		return stackByRepId.get(selectedCardId) ?? null;
	}, [selectedCardId, stackByRepId]);

	// Unique card count for skeleton placeholders (distinct Scryfall IDs)
	const uniqueIdentifierCount = useMemo(() => {
		if (!preview) return 0;
		return new Set(preview.parsed.cards.map((c) => `${c.set}/${c.collectorNumber || c.name}`)).size;
	}, [preview]);

	// Fallback rows for cards not yet fetched (name filter only)
	const filteredRows = useMemo(() => {
		if (!preview) return [];
		const seen = new Set<string>();
		const unique = preview.parsed.cards.filter((c) => {
			const key = c.name.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		if (!filters.name) return unique;
		return unique.filter((c) => c.name.toLowerCase().includes(filters.name.toLowerCase()));
	}, [preview, filters.name]);

	const isFiltered = !!(filters.name || activeFilterCount > 0);
	const totalCardCount =
		uniqueCards.length > 0 ? uniqueCards.length : (preview?.parsed.cards.length ?? 0);
	const filteredCount = filteredCards.length > 0 ? filteredCards.length : filteredRows.length;

	// Total copies of the logical card, keyed by the representative print id the grid
	// passes in (= the size of its stack).
	function getTotalQty(representativeId: string): number {
		const stack = stackByRepId.get(representativeId);
		return stack ? stack.cards.length : 1;
	}

	// CardModal calls onSave with a rowId. Resolve that copy's logical-card group and
	// apply the edit to every copy of that card (all editions), matching the
	// "remove all editions" grouping semantics.
	function handleEditSave(rowId: string, updates: Partial<CardEntry>) {
		if (!resolved) return;
		const target = resolved.resolved.find((c) => c.entry.rowId === rowId);
		if (!target) return;
		const group = cardGroupKey(target);
		resolved.resolved.forEach((card, index) => {
			if (cardGroupKey(card) === group) onUpdateCard(index, updates);
		});
	}

	// CardModal calls onRemove with a print id. Resolve its logical-card group and
	// remove all copies (every edition), in reverse to keep indices stable.
	function handleEditRemove(printId: string) {
		if (!resolved) return;
		const target = resolved.resolved.find((c) => c.id === printId);
		const group = target ? cardGroupKey(target) : printId;
		const indices = resolved.resolved
			.map((card, i) => (cardGroupKey(card) === group ? i : -1))
			.filter((i) => i !== -1)
			.reverse();
		for (const i of indices) {
			onRemoveCard(i);
		}
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
		uniqueCards,
		filteredCards,
		activeFilterCount,
		selectedImportStack,
		uniqueIdentifierCount,
		filteredRows,
		isFiltered,
		totalCardCount,
		filteredCount,
		getTotalQty,
		notFound: resolved?.notFound ?? [],
		uniqueNotFoundCount: new Set(
			(resolved?.notFound ?? []).map((c) => `${c.set}/${c.collectorNumber || c.name}`)
		).size,
		// Handlers
		handleDragOver,
		handleDragLeave,
		handleDrop,
		handleTextSubmit,
		handleEditSave,
		handleEditRemove,
	};
}
