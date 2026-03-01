'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import { useCardSearch, type ScryfallSortOrder, type ScryfallSortDir } from '@/hooks/useCardSearch';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useSets } from '@/hooks/useSets';
import { useDebounce } from '@/hooks/useDebounce';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchFilters } from '@/components/search/SearchFilters';
import { CardGrid } from '@/components/cards/CardGrid';
import { Spinner } from '@/components/ui/Spinner';
import styles from './page.module.css';

const VALID_COLORS = new Set(['W', 'U', 'B', 'R', 'G']);
const VALID_ORDERS = new Set([
	'name',
	'set',
	'released',
	'rarity',
	'color',
	'usd',
	'tix',
	'eur',
	'cmc',
	'power',
	'toughness',
	'edhrec',
	'penny',
	'artist',
	'review',
]);
const VALID_DIRS = new Set(['auto', 'asc', 'desc']);

function parseColorsFromParam(param: string | null): ScryfallColor[] {
	if (!param) return [];
	return param.split(',').filter((c) => VALID_COLORS.has(c)) as ScryfallColor[];
}

function parseOrderFromParam(param: string | null): ScryfallSortOrder {
	if (param && VALID_ORDERS.has(param)) return param as ScryfallSortOrder;
	return 'name';
}

function parseDirFromParam(param: string | null): ScryfallSortDir {
	if (param && VALID_DIRS.has(param)) return param as ScryfallSortDir;
	return 'auto';
}

export default function SearchPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<header className={styles.header}>
						<Link href="/" className={styles.logo}>
							MTG Snap
						</Link>
					</header>
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
	const searchParams = useSearchParams();

	// Initialize state from URL params
	const [name, setName] = useState(() => searchParams.get('name') ?? '');
	const [colors, setColors] = useState<ScryfallColor[]>(() =>
		parseColorsFromParam(searchParams.get('colors'))
	);
	const [type, setType] = useState(() => searchParams.get('type') ?? '');
	const [set, setSet] = useState(() => searchParams.get('set') ?? '');
	const [order, setOrder] = useState<ScryfallSortOrder>(() =>
		parseOrderFromParam(searchParams.get('order'))
	);
	const [dir, setDir] = useState<ScryfallSortDir>(() => parseDirFromParam(searchParams.get('dir')));

	// Debounce name for URL updates to avoid spamming history
	const debouncedName = useDebounce(name, 300);
	const isInitialMount = useRef(true);

	// Sync state to URL when filters change
	useEffect(() => {
		// Skip URL update on initial mount (we're reading from URL, not writing)
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}

		const params = new URLSearchParams();
		if (debouncedName) params.set('name', debouncedName);
		if (colors.length > 0) params.set('colors', colors.join(','));
		if (type) params.set('type', type);
		if (set) params.set('set', set);
		if (order !== 'name') params.set('order', order);
		if (dir !== 'auto') params.set('dir', dir);

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', {
			scroll: false,
		});
	}, [debouncedName, colors, type, set, order, dir, router]);

	const { sets, isLoading: setsLoading } = useSets();
	const { cards, isLoading, isLoadingMore, error, hasMore, totalCards, loadMore } = useCardSearch({
		name,
		colors,
		type,
		set,
		order,
		dir,
	});

	const { sentinelRef } = useInfiniteScroll({
		onLoadMore: loadMore,
		hasMore,
		isLoading: isLoading || isLoadingMore,
	});

	const handleCardClick = useCallback(
		(card: ScryfallCard) => {
			router.push(`/card/${card.id}`);
		},
		[router]
	);

	const hasFilters = name || colors.length > 0 || type || set;
	const showEmptyState = !hasFilters && !isLoading && cards.length === 0;

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<Link href="/" className={styles.logo}>
					MTG Snap
				</Link>
			</header>

			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchBar value={name} onChange={setName} placeholder="Search for cards..." />
					<SearchFilters
						colors={colors}
						onColorsChange={setColors}
						type={type}
						onTypeChange={setType}
						set={set}
						onSetChange={setSet}
						sets={sets}
						setsLoading={setsLoading}
						order={order}
						onOrderChange={setOrder}
						dir={dir}
						onDirChange={setDir}
					/>
				</div>

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

				{isLoading && (
					<div className={styles.loading}>
						<Spinner size="lg" />
					</div>
				)}

				{!isLoading && cards.length > 0 && (
					<>
						<CardGrid cards={cards} onCardClick={handleCardClick} />
						<div ref={sentinelRef} className={styles.sentinel}>
							{isLoadingMore && <Spinner size="md" />}
						</div>
					</>
				)}

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
