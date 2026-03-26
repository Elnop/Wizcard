'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterModal } from '@/components/search/FilterModal';
import { CardList } from '@/components/ui/CardList';
import { Spinner } from '@/components/ui/Spinner';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useSearchFiltersFromUrl } from './useSearchFiltersFromUrl';
import styles from './page.module.css';

export default function SearchPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchPageContent />
		</Suspense>
	);
}

function SearchPageContent() {
	const router = useRouter();
	useCollectionContext();

	const {
		name,
		setName,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		setOrder,
		dir,
		setDir,
		applyFilters,
		activeFilterCount,
	} = useSearchFiltersFromUrl();

	const [isModalOpen, setIsModalOpen] = useState(false);

	const { sets, isLoading: setsLoading } = useScryfallSets();
	const { cards, isLoading, isLoadingMore, error, hasMore, totalCards, loadMore } =
		useScryfallCardSearch({
			name,
			colors,
			colorMatch,
			type,
			set,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		});

	const handleCardClick = useCallback(
		(card: ScryfallCard) => router.push(`/card/${card.id}`),
		[router]
	);

	const hasFilters =
		name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
	const showEmptyState = !hasFilters && !isLoading && cards.length === 0;

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<div className={styles.searchRow}>
						<SearchBar value={name} onChange={setName} placeholder="Search for cards..." />
						<button
							type="button"
							className={styles.filtersButton}
							onClick={() => setIsModalOpen(true)}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M2 4h12M4 8h8M6 12h4"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
							Filtres
							{activeFilterCount > 0 && (
								<span className={styles.filterBadge}>{activeFilterCount}</span>
							)}
						</button>
					</div>
				</div>

				<FilterModal
					isOpen={isModalOpen}
					colors={colors}
					colorMatch={colorMatch}
					type={type}
					set={set}
					rarities={rarities}
					oracleText={oracleText}
					cmc={cmc}
					sets={sets}
					setsLoading={setsLoading}
					order={order}
					dir={dir}
					onApply={applyFilters}
					onClose={() => setIsModalOpen(false)}
				/>

				{hasFilters && !isLoading && cards.length > 0 && (
					<div className={styles.resultInfo}>
						<span>
							Showing {cards.length} of {totalCards.toLocaleString()} cards
						</span>
					</div>
				)}

				{error && (
					<div className={styles.error}>
						<p>Failed to load cards. Please try again.</p>
					</div>
				)}

				{showEmptyState && (
					<div className={styles.emptyState}>
						<h2>Start searching</h2>
						<p>Enter a card name or apply filters to find Magic: The Gathering cards.</p>
					</div>
				)}

				<CardList
					cards={cards}
					isLoading={isLoading}
					isLoadingMore={isLoadingMore}
					hasMore={hasMore}
					onLoadMore={loadMore}
					onCardClick={handleCardClick}
					sortOrder={order}
					sortDir={dir}
					onSortChange={(newOrder, newDir) => {
						setOrder(newOrder as Parameters<typeof setOrder>[0]);
						setDir(newDir);
					}}
					tableColumns={[
						{ key: 'name', label: 'Nom', sortKey: 'name' },
						{
							key: 'set',
							label: 'Set',
							sortKey: 'set',
							render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
						},
						{ key: 'type_line', label: 'Type' },
						{ key: 'cmc', label: 'CMC', sortKey: 'cmc' },
						{
							key: 'prices',
							label: 'Prix USD',
							sortKey: 'usd',
							render: (card) =>
								'prices' in card && card.prices && 'usd' in card.prices
									? (card.prices.usd ?? '—')
									: '—',
						},
					]}
				/>

				{!isLoading && hasFilters && cards.length === 0 && !error && (
					<div className={styles.noResults}>
						<h3>No cards found</h3>
						<p>Try adjusting your search or filters.</p>
					</div>
				)}
			</main>
		</div>
	);
}
