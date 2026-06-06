'use client';

import { useState, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Spinner } from '@/components/Spinner/Spinner';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCustomCards } from '@/lib/mpc/hooks/useCustomCards';
import { SearchModeSwitcher } from './components/SearchModeSwitcher/SearchModeSwitcher';
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
	const [selectedCard, setSelectedCard] = useState<AnyCard | null>(null);
	const [customSources, setCustomSources] = useState<MpcSourceWithCount[]>([]);

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
		mode,
		setMode,
		customSourceId,
		mpcTagsFilter,
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

	const {
		cards: customCards,
		isLoading: customLoading,
		isLoadingMore: customLoadingMore,
		hasMore: customHasMore,
		total: customTotal,
		loadMore: loadMoreCustom,
		error: customError,
	} = useCustomCards(mode === 'custom' || mode === 'all' ? customSourceId : undefined, {
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
		mpcTagsFilter,
	});

	const mergedCards: AnyCard[] = useMemo(() => {
		if (mode === 'all') return [...cards, ...customCards.filter((c) => !c.oracle_id)];
		if (mode === 'custom') return customCards;
		return cards;
	}, [mode, cards, customCards]);

	let resolvedHasMore: boolean;
	if (mode === 'all') resolvedHasMore = hasMore || customHasMore;
	else if (mode === 'custom') resolvedHasMore = customHasMore;
	else resolvedHasMore = hasMore;

	const resolvedLoadMore = useCallback(() => {
		if (mode === 'all') {
			if (hasMore) loadMore();
			if (customHasMore) loadMoreCustom();
		} else if (mode === 'custom') {
			loadMoreCustom();
		} else {
			loadMore();
		}
	}, [mode, hasMore, customHasMore, loadMore, loadMoreCustom]);

	let resolvedIsLoadingMore: boolean;
	if (mode === 'all') resolvedIsLoadingMore = isLoadingMore || customLoadingMore;
	else if (mode === 'custom') resolvedIsLoadingMore = customLoadingMore;
	else resolvedIsLoadingMore = isLoadingMore;

	useEffect(() => {
		getCustomCardSourcesWithCount()
			.then(setCustomSources)
			.catch(() => {});
	}, []);

	const handleCardClick = useCallback((card: AnyCard) => setSelectedCard(card), []);

	const hasFilters =
		name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
	const isDefaultQuery = !hasFilters;

	const totalActiveFilterCount =
		activeFilterCount + (customSourceId !== null ? 1 : 0) + mpcTagsFilter.length;

	const tableColumns = [
		{ key: 'name', label: 'Nom', sortKey: 'name' },
		{
			key: 'set',
			label: 'Set',
			sortKey: 'set',
			render: (card: AnyCard) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
		},
		{ key: 'type_line', label: 'Type' },
		{ key: 'cmc', label: 'CMC', sortKey: 'cmc' },
		{
			key: 'prices',
			label: 'Prix USD',
			sortKey: 'usd',
			render: (card: AnyCard) =>
				'prices' in card && card.prices && 'usd' in card.prices ? (card.prices.usd ?? '—') : '—',
		},
	];

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<div className={styles.searchRow}>
						<SearchBar value={name} onChange={setName} placeholder="Search for cards..." />
						<SearchModeSwitcher value={mode} onChange={setMode} />
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
					mpcTagsFilter={mpcTagsFilter}
					onApply={applyFilters}
					onClose={() => setIsModalOpen(false)}
				/>

				{!isDefaultQuery && !isLoading && !customLoading && mergedCards.length > 0 && (
					<div className={styles.resultInfo}>
						<span>
							{mode === 'official' &&
								cards.length > 0 &&
								`Showing ${cards.length} of ${totalCards.toLocaleString()} cards`}
							{mode === 'all' && (
								<>
									{cards.length > 0 && `${cards.length} of ${totalCards.toLocaleString()} cards`}
									{customTotal > 0 && ` · ${customTotal} custom`}
								</>
							)}
							{mode === 'custom' && `${customTotal} custom`}
						</span>
					</div>
				)}

				{isDefaultQuery && !isLoading && (
					<div className={styles.resultInfo}>
						<span>Cartes populaires EDH</span>
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

				<CardList
					cards={mergedCards}
					isLoading={isLoading || customLoading}
					isLoadingMore={resolvedIsLoadingMore}
					hasMore={resolvedHasMore}
					onLoadMore={resolvedLoadMore}
					onCardClick={handleCardClick}
					renderOverlay={withCustomBadge}
					sortOrder={order}
					sortDir={dir}
					onSortChange={(newOrder, newDir) => {
						setOrder(newOrder as Parameters<typeof setOrder>[0]);
						setDir(newDir);
					}}
					pageSize={false}
					tableColumns={tableColumns}
				/>

				{customError && (
					<div className={styles.error}>
						<p>Impossible de charger les cartes custom.</p>
					</div>
				)}

				{!isLoading && !customLoading && !isDefaultQuery && mergedCards.length === 0 && !error && (
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
