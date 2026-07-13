'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { Spinner } from '@/components/Spinner/Spinner';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCustomCards } from '@/lib/mpc/hooks/useCustomCards';
import { SearchModeSwitcher } from './components/SearchModeSwitcher/SearchModeSwitcher';
import { useSearchFiltersFromUrl } from './useSearchFiltersFromUrl';
import { getCustomCardSourcesWithCount } from '@/lib/mpc/db/custom-cards';
import type { MpcSourceWithCount } from '@/lib/mpc/db/custom-cards';
import type { MpcTagsFilterValue } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';
import { useRouter } from '@/i18n/navigation';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import { buildSearchMenuItems } from './searchCardMenu';
import styles from './page.module.css';

function computeCustomFilterCount(
	customSourceId: string | null,
	mpcTags: MpcTagsFilterValue
): number {
	return (
		(customSourceId !== null ? 1 : 0) +
		mpcTags.mustHave.length +
		(mpcTags.mustNotHave.join(',') !== 'NSFW' ? mpcTags.mustNotHave.length : 0)
	);
}

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
	const { addCards } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const router = useRouter();
	const { openAddToDeck } = useAddToDeckModal();
	const { openAddCard } = useAddCardModal();
	const { openCardModal } = useCardModalContext();
	const [customSources, setCustomSources] = useState<MpcSourceWithCount[]>([]);

	const {
		name,
		setName,
		colors,
		colorMatch,
		colorIdentity,
		colorIdentityMatch,
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
		mpcTags,
		oracleIdFilter,
		applyFilters,
		activeFilterCount,
	} = useSearchFiltersFromUrl();

	const [isModalOpen, setIsModalOpen] = useState(false);

	const { sets, isLoading: setsLoading } = useScryfallSets();

	const isBacks = mode === 'backs';

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
	} = useScryfallCardSearch(
		{
			name,
			colors,
			colorMatch,
			colorIdentity,
			colorIdentityMatch,
			type,
			set,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		},
		{ enabled: mode === 'official' }
	);

	const {
		cards: customCards,
		isLoading: customLoading,
		isLoadingMore: customLoadingMore,
		hasMore: customHasMore,
		total: customTotal,
		loadMore: loadMoreCustom,
		error: customError,
	} = useCustomCards(mode !== 'official' ? customSourceId : undefined, {
		name,
		colors: isBacks ? [] : colors,
		colorMatch,
		colorIdentity: [],
		colorIdentityMatch: 'atMost',
		type: isBacks ? [] : type,
		set: isBacks ? '' : set,
		rarities: isBacks ? [] : rarities,
		oracleText: isBacks ? '' : oracleText,
		cmc: isBacks ? '' : cmc,
		order: isBacks ? 'name' : order,
		dir,
		mpcTagsMustHave: mpcTags.mustHave,
		mpcTagsMustNotHave: mpcTags.mustNotHave,
		oracleIdFilter: isBacks ? 'all' : oracleIdFilter,
		cardTypes: isBacks ? ['cardback'] : ['card', 'token'],
	});

	const displayedCards: AnyCard[] = mode === 'official' ? cards : customCards;
	const displayedHasMore = mode === 'official' ? hasMore : customHasMore;
	const displayedLoadMore = mode === 'official' ? loadMore : loadMoreCustom;
	const displayedIsLoadingMore = mode === 'official' ? isLoadingMore : customLoadingMore;

	useEffect(() => {
		getCustomCardSourcesWithCount()
			.then(setCustomSources)
			.catch(() => {});
	}, []);

	const handleCardClick = useCallback(
		(card: AnyCard) => openCardModal(card as ScryfallCard),
		[openCardModal]
	);

	const hasFilters =
		name ||
		colors.length > 0 ||
		colorIdentity.length > 0 ||
		type.length > 0 ||
		set ||
		rarities.length > 0 ||
		oracleText ||
		cmc;
	const isDefaultQuery = !hasFilters && mode === 'official';

	const customFilterCount = computeCustomFilterCount(customSourceId, mpcTags);

	const oracleIdFilterCount = oracleIdFilter !== 'all' ? 1 : 0;
	const totalActiveFilterCount = isBacks
		? customFilterCount
		: activeFilterCount + customFilterCount + oracleIdFilterCount;

	// Cardbacks have no set, type, CMC or price: only the name column makes sense.
	const tableColumns = isBacks
		? [{ key: 'name', label: 'Name', sortKey: 'name' }]
		: [
				{ key: 'name', label: 'Name', sortKey: 'name' },
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
						'prices' in card && card.prices && 'usd' in card.prices
							? (card.prices.usd ?? '—')
							: '—',
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
					variant={isBacks ? 'backs' : 'search'}
					colors={colors}
					colorMatch={colorMatch}
					colorIdentity={colorIdentity}
					colorIdentityMatch={colorIdentityMatch}
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
					mpcTags={mpcTags}
					oracleIdFilter={oracleIdFilter}
					onApply={applyFilters}
					onClose={() => setIsModalOpen(false)}
				/>

				{!isDefaultQuery && !isLoading && !customLoading && displayedCards.length > 0 && (
					<div className={styles.resultInfo}>
						<span>
							{mode === 'official' &&
								cards.length > 0 &&
								`Showing ${cards.length} of ${totalCards.toLocaleString()} cards`}
							{mode === 'custom' && `${customTotal} custom`}
							{mode === 'backs' && `${customTotal} cardbacks`}
						</span>
					</div>
				)}

				{isDefaultQuery && !isLoading && (
					<div className={styles.resultInfo}>
						<span>Popular EDH cards</span>
					</div>
				)}

				{mode === 'official' && error && (
					<div className={styles.error}>
						<p>An error occurred. Please try again.</p>
					</div>
				)}

				{mode === 'official' && queryError && (
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
					cards={displayedCards}
					isLoading={isLoading || customLoading}
					isLoadingMore={displayedIsLoadingMore}
					hasMore={displayedHasMore}
					onLoadMore={displayedLoadMore}
					onCardClick={handleCardClick}
					buildCardMenuItems={(card, close) =>
						buildSearchMenuItems(
							card,
							{
								onViewDetails: (c) => openCardModal(c as ScryfallCard),
								onOpenCardPage: (c) => router.push(`/card/${c.id}`),
								onAddToCollection: (c) =>
									openAddCard({
										scryfallCard: c as ScryfallCard,
										onAdd: (card, entry, count) => addCards(card, count, entry),
									}),
								onAddToWishlist: (c) =>
									openAddCard({
										scryfallCard: c as ScryfallCard,
										onAdd: (card, entry, count) => addToWishlist(card, entry, count),
									}),
								onAddToDeck: (c) => openAddToDeck(c),
							},
							close
						)
					}
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
						<p>Failed to load custom cards.</p>
					</div>
				)}

				{!isLoading &&
					!customLoading &&
					!isDefaultQuery &&
					displayedCards.length === 0 &&
					!error &&
					!customError && (
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
			</main>
		</div>
	);
}
