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
import { FilterModal } from '@/components/search/FilterModal';
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
const VALID_COLOR_MATCHES = new Set(['exact', 'include', 'atMost']);
const VALID_RARITIES = new Set(['common', 'uncommon', 'rare', 'mythic']);

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

function parseColorMatchFromParam(param: string | null): 'exact' | 'include' | 'atMost' {
	if (param && VALID_COLOR_MATCHES.has(param)) return param as 'exact' | 'include' | 'atMost';
	return 'include';
}

function parseRaritiesFromParam(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter((r) => VALID_RARITIES.has(r));
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
	const [colorMatch, setColorMatch] = useState<'exact' | 'include' | 'atMost'>(() =>
		parseColorMatchFromParam(searchParams.get('colorMatch'))
	);
	const [type, setType] = useState(() => searchParams.get('type') ?? '');
	const [set, setSet] = useState(() => searchParams.get('set') ?? '');
	const [rarities, setRarities] = useState<string[]>(() =>
		parseRaritiesFromParam(searchParams.get('rarities'))
	);
	const [oracleText, setOracleText] = useState(() => searchParams.get('oracle') ?? '');
	const [cmc, setCmc] = useState(() => searchParams.get('cmc') ?? '');
	const [order, setOrder] = useState<ScryfallSortOrder>(() =>
		parseOrderFromParam(searchParams.get('order'))
	);
	const [dir, setDir] = useState<ScryfallSortDir>(() => parseDirFromParam(searchParams.get('dir')));
	const [isModalOpen, setIsModalOpen] = useState(false);

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
		if (colorMatch !== 'include') params.set('colorMatch', colorMatch);
		if (type) params.set('type', type);
		if (set) params.set('set', set);
		if (rarities.length > 0) params.set('rarities', rarities.join(','));
		if (oracleText) params.set('oracle', oracleText);
		if (cmc) params.set('cmc', cmc);
		if (order !== 'name') params.set('order', order);
		if (dir !== 'auto') params.set('dir', dir);

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', {
			scroll: false,
		});
	}, [debouncedName, colors, colorMatch, type, set, rarities, oracleText, cmc, order, dir, router]);

	const { sets, isLoading: setsLoading } = useSets();
	const { cards, isLoading, isLoadingMore, error, hasMore, totalCards, loadMore } = useCardSearch({
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

	const handleApplyFilters = useCallback(
		(filters: {
			colors: ScryfallColor[];
			colorMatch: 'exact' | 'include' | 'atMost';
			type: string;
			set: string;
			rarities: string[];
			oracleText: string;
			cmc: string;
			order: ScryfallSortOrder;
			dir: ScryfallSortDir;
		}) => {
			setColors(filters.colors);
			setColorMatch(filters.colorMatch);
			setType(filters.type);
			setSet(filters.set);
			setRarities(filters.rarities);
			setOracleText(filters.oracleText);
			setCmc(filters.cmc);
			setOrder(filters.order);
			setDir(filters.dir);
		},
		[]
	);

	const activeFilterCount =
		colors.length +
		(type ? 1 : 0) +
		(set ? 1 : 0) +
		(order !== 'name' || dir !== 'auto' ? 1 : 0) +
		rarities.length +
		(oracleText ? 1 : 0) +
		(cmc ? 1 : 0);

	const hasFilters =
		name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
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
					onApply={handleApplyFilters}
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
