'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { DeckFilterModal } from '@/lib/search/components/DeckFilterModal/DeckFilterModal';
import { useDeckSearch } from '@/lib/search/hooks/useDeckSearch';
import { countActiveDeckFilters, type DeckSearchFilters } from '@/lib/search/types';
import { DeckCard } from '@/app/[locale]/decks/components/DeckCard/DeckCard';
import { useDeckSummaries } from '@/app/[locale]/decks/useDeckSummaries';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { useInfiniteScroll } from '@/lib/card/components/CardList/useInfiniteScroll';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from '../page.module.css';

type Props = {
	filters: DeckSearchFilters;
	onFiltersChange: (f: DeckSearchFilters) => void;
};

export function DeckSearchView({ filters, onFiltersChange }: Props) {
	const t = useTranslations('search');
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const symbolMap = useScryfallSymbols();
	const { decks, isLoading, isLoadingMore, hasMore, total, loadMore } = useDeckSearch(filters);
	const activeCount = countActiveDeckFilters(filters);

	// Deck cards of public decks are readable via RLS, so summaries (cover art,
	// commander name, mana curve) resolve for search results just like on /decks.
	const deckMetas = useMemo(() => decks.map((d) => d.deck), [decks]);
	const summaryMap = useDeckSummaries(deckMetas);

	// isLoadingMore (not isLoading) gates the observer: isLoading is only true on
	// the initial/filter-changed fetch, when the sentinel isn't rendered anyway.
	// Passing isLoadingMore is what stops a visible sentinel from firing loadMore
	// repeatedly while a page is already in flight.
	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore,
		isLoading: isLoadingMore,
	});

	return (
		<>
			<div className={`${styles.searchRow} ${styles.entitySearchRow}`}>
				<SearchBar
					value={filters.name}
					onChange={(v) => onFiltersChange({ ...filters, name: v })}
					placeholder={t('deckSearchPlaceholder')}
				/>
				<button type="button" className={styles.filtersButton} onClick={() => setModalOpen(true)}>
					{t('filters')}
					{activeCount > 0 && <span className={styles.filterBadge}>{activeCount}</span>}
				</button>
			</div>

			<DeckFilterModal
				isOpen={modalOpen}
				filters={filters}
				onApply={onFiltersChange}
				onClose={() => setModalOpen(false)}
			/>

			{!isLoading && decks.length > 0 && (
				<div className={styles.resultInfo}>
					<span>{t('deckResultsCount', { count: total })}</span>
				</div>
			)}

			{isLoading ? (
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			) : (
				<div className={styles.deckGrid}>
					{decks.map(({ deck, authorNickname }) => (
						<DeckCard
							key={deck.id}
							deck={deck}
							summary={summaryMap[deck.id]}
							symbolMap={symbolMap}
							authorNickname={authorNickname}
							isPrecon={deck.source === 'mtgjson'}
							readOnly
							onClick={() => router.push(`/decks/${deck.id}`)}
						/>
					))}
				</div>
			)}

			{/* Infinite scroll, same mechanism as the card search: an observed
			    sentinel below the grid triggers the next page as it comes into
			    view, instead of a "load more" button. */}
			{hasMore && !isLoading && (
				<>
					<div ref={sentinelRef} />
					<div className={styles.sentinel}>
						<Spinner size="md" />
					</div>
				</>
			)}
		</>
	);
}
