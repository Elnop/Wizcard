'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCustomCards } from '@/lib/mpc/hooks/useCustomCards';
import { SearchModeSwitcher } from './components/SearchModeSwitcher/SearchModeSwitcher';
import type { SearchMode } from './components/SearchModeSwitcher/SearchModeSwitcher';
import { useSearchFiltersFromUrl } from './useSearchFiltersFromUrl';
import { getCustomCardSourcesWithCount } from '@/lib/supabase/custom-cards';
import type { MpcSourceWithCount } from '@/lib/supabase/custom-cards';
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
	const { addCard } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
	const [mode, setMode] = useState<SearchMode>('official');
	const [customSources, setCustomSources] = useState<MpcSourceWithCount[]>([]);
	const [customSourceId, setCustomSourceId] = useState<string | null>(null);

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
	const {
		cards,
		isLoading,
		isLoadingMore,
		error,
		queryError,
		hasMore,
		totalCards,
		suggestions,
		loadMore,
	} = useScryfallCardSearch({
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

	const showOfficial = mode === 'official' || mode === 'all';
	const showCustom = mode === 'custom' || mode === 'all';

	const {
		cards: customCards,
		isLoading: customLoading,
		error: customError,
	} = useCustomCards(showCustom ? customSourceId : undefined);

	useEffect(() => {
		getCustomCardSourcesWithCount()
			.then(setCustomSources)
			.catch(() => {});
	}, []);

	const handleCardClick = useCallback((card: ScryfallCard) => setSelectedCard(card), []);

	const hasFilters =
		name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
	const isDefaultQuery = !hasFilters;
	const showEmptyState = showOfficial && !isDefaultQuery && !isLoading && cards.length === 0;

	const totalActiveFilterCount = activeFilterCount + (customSourceId !== null ? 1 : 0);

	const tableColumns = [
		{ key: 'name', label: 'Nom', sortKey: 'name' },
		{
			key: 'set',
			label: 'Set',
			sortKey: 'set',
			render: (card: ScryfallCard) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
		},
		{ key: 'type_line', label: 'Type' },
		{ key: 'cmc', label: 'CMC', sortKey: 'cmc' },
		{
			key: 'prices',
			label: 'Prix USD',
			sortKey: 'usd',
			render: (card: ScryfallCard) =>
				'prices' in card && card.prices && 'usd' in card.prices ? (card.prices.usd ?? '—') : '—',
		},
	];

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<div className={styles.searchRow}>
						<SearchBar value={name} onChange={setName} placeholder="Search for cards..." />
						<SearchModeSwitcher onChange={setMode} />
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
							{totalActiveFilterCount > 0 && (
								<span className={styles.filterBadge}>{totalActiveFilterCount}</span>
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
					customSources={customSources}
					customSourceId={customSourceId}
					onApply={(filters) => {
						applyFilters(filters);
						setCustomSourceId(filters.customSourceId);
					}}
					onClose={() => setIsModalOpen(false)}
				/>

				{showOfficial && (
					<>
						{isDefaultQuery && !isLoading && (
							<div className={styles.resultInfo}>
								<span>Cartes populaires EDH</span>
							</div>
						)}

						{!isDefaultQuery && !isLoading && cards.length > 0 && (
							<div className={styles.resultInfo}>
								<span>
									Showing {cards.length} of {totalCards.toLocaleString()} cards
								</span>
							</div>
						)}

						{error && (
							<div className={styles.error}>
								<p>An error occurred. Please try again.</p>
							</div>
						)}

						{queryError && (
							<div className={styles.queryError}>
								<p>{queryError.message}</p>
								{queryError.warnings.length > 0 && (
									<ul className={styles.queryWarnings}>
										{queryError.warnings.map((w) => (
											<li key={w}>{w}</li>
										))}
									</ul>
								)}
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
							pageSize={false}
							tableColumns={tableColumns}
						/>

						{!isLoading && !isDefaultQuery && cards.length === 0 && !error && (
							<div className={styles.noResults}>
								<h3>No cards found</h3>
								{suggestions.length > 0 ? (
									<>
										<p>Did you mean:</p>
										<ul className={styles.suggestions}>
											{suggestions.map((s) => (
												<li key={s}>
													<button
														type="button"
														className={styles.suggestionLink}
														onClick={() => setName(s)}
													>
														{s}
													</button>
												</li>
											))}
										</ul>
									</>
								) : (
									<p>Try adjusting your search or filters.</p>
								)}
							</div>
						)}
					</>
				)}

				{showCustom && (
					<>
						{showOfficial && (
							<div className={styles.customSectionHeader}>
								Cartes Custom
								<span className={styles.customBadge}>MPC</span>
							</div>
						)}

						{customError && (
							<div className={styles.error}>
								<p>Impossible de charger les cartes custom.</p>
							</div>
						)}

						<CardList
							cards={customCards}
							isLoading={customLoading}
							onCardClick={handleCardClick}
							tableColumns={tableColumns}
						/>

						{!customLoading && !customError && customCards.length === 0 && (
							<div className={styles.emptyState}>
								<h2>Aucune carte custom</h2>
								<p>Aucune carte personnalisée disponible pour le moment.</p>
							</div>
						)}
					</>
				)}

				{selectedCard && (
					<CardModal
						cards={selectedCard}
						onClose={() => setSelectedCard(null)}
						onAddToCollection={(card, entry) => {
							addCard(card, entry);
						}}
						onAddToWishlist={(card, entry) => {
							addToWishlist(card, entry);
						}}
					/>
				)}
			</main>
		</div>
	);
}
