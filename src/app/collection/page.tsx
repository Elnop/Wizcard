'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useCollectionContext } from '@/lib/supabase/contexts/CollectionContext';
import { useCollectionCards } from '@/hooks/useCollectionCards';
import { useImportContext } from '@/lib/import/contexts/ImportContext';
import { useCollectionFilters, defaultCollectionFilters } from '@/hooks/useCollectionFilters';
import type { CollectionFilters } from '@/hooks/useCollectionFilters';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { CollectionGrid } from '@/components/collection/CollectionGrid';
import { CollectionFiltersAside } from '@/components/collection/CollectionFiltersAside';
import { ImportPreviewModal } from '@/components/collection/ImportPreviewModal';
import { CardCollectionModal } from '@/components/collection/CardCollectionModal';
import { Button } from '@/components/ui/Button';
import { putCardsInCache } from '@/lib/card-cache';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import type { Card, CardStack, CardEntry, CollectionStats } from '@/types/cards';
import styles from './page.module.css';

function computeStats(stacks: CardStack[]): CollectionStats {
	const sets = new Set<string>();
	const rarityDistribution: Record<string, number> = {};
	let totalCards = 0;

	for (const stack of stacks) {
		for (const card of stack.cards) {
			totalCards += 1;
			sets.add(card.set);
			rarityDistribution[card.rarity] = (rarityDistribution[card.rarity] ?? 0) + 1;
		}
	}

	return {
		totalCards,
		uniqueCards: stacks.length,
		uniqueByEdition: stacks.reduce((n, s) => n + s.cards.length, 0),
		setCount: sets.size,
		rarityDistribution,
	};
}

export default function CollectionPage() {
	const {
		entries,
		isLoaded,
		addCard,
		decrementCard,
		removeCard,
		updateEntry,
		changePrint,
		clearCollection,
	} = useCollectionContext();
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
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
		confirm: confirmImport,
		cancel,
		reset,
		updateRow,
		removeRow,
		formatRegistry,
	} = useImportContext();
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);
	const [pendingScryfallCard, setPendingScryfallCard] = useState<ScryfallCard | null>(null);

	// Filters operate on the representative card of each stack (cards[0])
	const representativeCards = useMemo(
		() => stacks.map((s) => s.cards[0]).filter(Boolean),
		[stacks]
	);

	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const filteredRepCards = useCollectionFilters(representativeCards, filters);

	// Rebuild stacks for the filtered representatives
	const filteredStacks = useMemo(() => {
		const filteredNames = new Set(filteredRepCards.map((c) => c.name));
		return stacks.filter((s) => filteredNames.has(s.name));
	}, [stacks, filteredRepCards]);

	const stats = useMemo(() => computeStats(filteredStacks), [filteredStacks]);

	const activeFilterCount = useMemo(
		() =>
			filters.colors.length +
			(filters.type ? 1 : 0) +
			(filters.set ? 1 : 0) +
			(filters.order !== 'name' || filters.dir !== 'auto' ? 1 : 0) +
			filters.rarities.length +
			(filters.oracleText ? 1 : 0) +
			(filters.cmc ? 1 : 0) +
			(filters.name ? 1 : 0),
		[filters]
	);

	// Keep selectedStack in sync after hydration updates
	const resolvedStack = useMemo<CardStack | null>(() => {
		if (!selectedStack) return null;
		// Find updated stack by name
		const fromStacks = stacks.find((s) => s.name === selectedStack.name) ?? null;
		if (fromStacks) return fromStacks;
		// After a print change, use the pending Scryfall card
		if (pendingScryfallCard) {
			const newStack = stacks.find((s) => s.name === pendingScryfallCard.name) ?? null;
			if (newStack) return newStack;
		}
		return null;
	}, [selectedStack, stacks, pendingScryfallCard]);

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

	const handleChangePrint = useCallback(
		(oldScryfallId: string, newCard: ScryfallCard) => {
			void putCardsInCache([newCard]);
			setPendingScryfallCard(newCard);
			changePrint(oldScryfallId, newCard.id);
			if (newCard.lang) {
				const language = SCRYFALL_CODE_TO_LANGUAGE[newCard.lang];
				// Update all copies with the new language via their rowIds
				// (changePrint creates new rowIds — we update after the stack rehydrates)
				if (language && resolvedStack) {
					for (const card of resolvedStack.cards) {
						updateEntry(card.entry.rowId, { language });
					}
				}
			}
			// Update selected stack to new card name
			setSelectedStack({ name: newCard.name, cards: [] });
		},
		[changePrint, updateEntry, resolvedStack]
	);

	function handleClearCollection() {
		if (confirm('Effacer toute la collection ? Cette action est irréversible.')) {
			clearCollection();
		}
	}

	const handleExport = useCallback(() => {
		const allCards: Card[] = stacks.flatMap((s) => s.cards);
		downloadCSV(serializeToMoxfieldCSV(allCards), 'my-collection.csv');
	}, [stacks]);

	const handleConfirmImport = useCallback(async () => {
		await confirmImport();
		reset();
	}, [confirmImport, reset]);

	if (!isLoaded) {
		return <div className={styles.page} />;
	}

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
				onIncrement={handleIncrementModal}
				onDecrement={handleDecrementModal}
				onChangePrint={handleChangePrint}
			/>
		</div>
	);
}
