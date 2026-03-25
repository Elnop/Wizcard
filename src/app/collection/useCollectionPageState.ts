'use client';

import { useState, useCallback, useMemo } from 'react';
import { useCollectionContext } from '@/lib/supabase/contexts/CollectionContext';
import { useCollectionCards } from '@/hooks/useCollectionCards';
import { useImportContext } from '@/lib/import/contexts/ImportContext';
import {
	useCollectionFilters,
	defaultCollectionFilters,
	getSortValue,
} from '@/hooks/useCollectionFilters';
import type { CollectionFilters } from '@/hooks/useCollectionFilters';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { putCardsInCache } from '@/lib/card-cache';
import { computeCollectionStats } from '@/lib/collection/stats';
import { countActiveFilters } from '@/lib/filters/types';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import type { Card, CardStack, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export function useCollectionPageState() {
	const {
		entries,
		isLoaded,
		addCard,
		duplicateEntry,
		decrementCard,
		removeCard,
		removeEntry,
		updateEntry,
		changePrint,
		clearCollection,
	} = useCollectionContext();

	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);

	const importCtx = useImportContext();
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);
	const [pendingScryfallCard, setPendingScryfallCard] = useState<ScryfallCard | null>(null);
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);

	// Filters operate on the representative card of each stack (cards[0])
	const representativeCards = useMemo(
		() => stacks.map((s) => s.cards[0]).filter(Boolean),
		[stacks]
	);
	const filteredRepCards = useCollectionFilters(representativeCards, filters);

	const filteredStacks = useMemo(() => {
		const stackByName = new Map(stacks.map((s) => [s.name, s]));
		const { order, dir } = filters;
		return filteredRepCards
			.map((c) => stackByName.get(c.name))
			.filter(Boolean)
			.map((stack) => {
				if (stack!.cards.length <= 1) return stack!;
				const sorted = [...stack!.cards].sort((a, b) => {
					const av = getSortValue(a, order);
					const bv = getSortValue(b, order);
					let cmp: number;
					if (typeof av === 'number' && typeof bv === 'number') {
						cmp = av - bv;
					} else {
						cmp = String(av).localeCompare(String(bv));
					}
					if (dir === 'desc') cmp = -cmp;
					if (cmp === 0) cmp = a.entry.dateAdded.localeCompare(b.entry.dateAdded);
					return cmp;
				});
				return { ...stack!, cards: sorted };
			}) as CardStack[];
	}, [stacks, filteredRepCards, filters]);

	const stats = useMemo(() => computeCollectionStats(filteredStacks), [filteredStacks]);

	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	// Keep selectedStack in sync after hydration updates
	const resolvedStack = useMemo<CardStack | null>(() => {
		if (!selectedStack) return null;
		const fromStacks = stacks.find((s) => s.name === selectedStack.name) ?? null;
		if (fromStacks) return fromStacks;
		if (pendingScryfallCard) {
			const newStack = stacks.find((s) => s.name === pendingScryfallCard.name) ?? null;
			if (newStack) return newStack;
		}
		return null;
	}, [selectedStack, stacks, pendingScryfallCard]);

	// Modal handlers
	const handleCardClick = useCallback((stack: CardStack) => setSelectedStack(stack), []);

	const handleCloseModal = useCallback(() => {
		setSelectedStack(null);
		setPendingScryfallCard(null);
	}, []);

	const handleSaveModal = useCallback(
		(rowId: string, updates: Partial<CardEntry>) => updateEntry(rowId, updates),
		[updateEntry]
	);

	const handleRemoveModal = useCallback(
		(scryfallId: string) => {
			removeCard(scryfallId);
			setSelectedStack(null);
			setPendingScryfallCard(null);
		},
		[removeCard]
	);

	const handleIncrementModal = useCallback(() => {
		if (resolvedStack && resolvedStack.cards.length > 0) {
			addCard(resolvedStack.cards[0]);
		}
	}, [resolvedStack, addCard]);

	const handleDecrementModal = useCallback(() => {
		if (resolvedStack && resolvedStack.cards.length > 0) {
			decrementCard(resolvedStack.cards[0].id);
		}
	}, [resolvedStack, decrementCard]);

	const handleDuplicateEntry = useCallback(
		(scryfallId: string, entry: CardEntry) => duplicateEntry(scryfallId, entry),
		[duplicateEntry]
	);

	const handleRemoveEntry = useCallback((rowId: string) => removeEntry(rowId), [removeEntry]);

	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard) => {
			void putCardsInCache([newCard]);
			setPendingScryfallCard(newCard);
			const language = newCard.lang ? SCRYFALL_CODE_TO_LANGUAGE[newCard.lang] : undefined;
			changePrint(rowId, newCard.id, language ? { language } : undefined);
			setSelectedStack({ oracleId: newCard.oracle_id, name: newCard.name, cards: [] });
		},
		[changePrint]
	);

	const handleClearCollection = useCallback(() => {
		if (confirm('Effacer toute la collection ? Cette action est irréversible.')) {
			clearCollection();
		}
	}, [clearCollection]);

	const handleExport = useCallback(() => {
		const allCards: Card[] = stacks.flatMap((s) => s.cards);
		downloadCSV(serializeToMoxfieldCSV(allCards), 'my-collection.csv');
	}, [stacks]);

	const handleConfirmImport = useCallback(async () => {
		await importCtx.confirm();
		importCtx.reset();
	}, [importCtx]);

	return {
		// Data
		entries,
		isLoaded,
		filteredStacks,
		stats,
		isHydrating,
		totalExpected,

		// Filters
		filters,
		setFilters,
		sets,
		setsLoading,
		activeFilterCount,

		// Import
		importCtx,

		// Modal state
		resolvedStack,
		decrementCard,

		// Handlers
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
	};
}
