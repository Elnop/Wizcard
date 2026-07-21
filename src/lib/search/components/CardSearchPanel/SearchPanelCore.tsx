'use client';
import { useTranslations } from 'next-intl';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { SearchAllLanguagesToggle } from '@/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { CardModeSwitcher } from './CardModeSwitcher';
import {
	useScryfallCardSearch,
	type SearchFilters,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import {
	filterCollectionCards,
	defaultCollectionFilters,
} from '@/lib/card/utils/filterCollectionCards';
import type { CollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { CardEntry } from '@/types/cards';
import styles from './CardSearchPanel.module.css';

/**
 * Deck-only additions merged into the Scryfall query (format legality +
 * commander color identity + the "no card can match" short-circuit). Computed
 * by the deck wrapper from the panel's live filter state (exposed via
 * `renderExtras`); non-deck modes leave this at its defaults.
 */
export type ExtraScryfallFilters = Pick<SearchFilters, 'legal' | 'colorIdentity' | 'matchNothing'>;

/**
 * Live search state the core exposes to the deck wrapper so it can (a) compute
 * legality/CI query additions and (b) filter the in-collection overlay to match
 * the same name/filters.
 */
export type SearchState = {
	name: string;
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
};

/** What the deck wrapper returns to steer the core, given the live search state. */
export type DeckSteering = {
	/** Extra legality/CI additions to the Scryfall query. */
	extraFilters?: ExtraScryfallFilters;
	/** True → show the in-collection overlay instead of Scryfall results. */
	inCollectionOnly?: boolean;
	/**
	 * Given the collection representative cards, return the filtered overlay set.
	 * Generic so it preserves the concrete card type (collection cards carry an
	 * `entry`); it only reads Scryfall fields (legalities/color_identity).
	 */
	filterCollection?: <T extends AnyCard>(cards: T[]) => T[];
	/** Suppress all results (impossible CI constraint). */
	matchNothing?: boolean;
};

export type SearchPanelCoreProps = {
	title: string;
	expanded: boolean;
	onToggleExpand?: () => void;
	onClose: () => void;

	/** Left-click on a result. */
	onCardClick: (card: AnyCard) => void;
	/** Right-click context menu for a result. Omit for no menu. */
	buildCardMenuItems?: (card: AnyCard, close: () => void) => ContextMenuAction[];
	/** Overlay rendered on each result. Defaults to the custom-badge overlay. */
	renderOverlay?: (card: AnyCard) => ReactNode;

	/** Hide the all-languages toggle (deck hides it in collection-only mode). */
	hideMultilingual?: boolean;
	/** Show the card/token switcher (deck-only). */
	showTokenMode?: boolean;
	/** Token/card toggle changed. */
	onTokenModeChange?: (isToken: boolean) => void;

	/** Extra toggle rows under the search row (deck: legality / in-collection). */
	renderToggles?: () => ReactNode;
	/** Tabs above the search row (deck: Search / EDHREC). */
	tabs?: ReactNode;
	/** Replaces the whole search body (deck EDHREC tab). */
	bodyOverride?: ReactNode;
	/** Rendered at the end of the panel (deck: the SearchCardContextMenu portal). */
	footer?: ReactNode;

	/**
	 * Deck wrapper hook: called with the live search state each render, returns
	 * how to steer the query/results. Pure — must not set state. Non-deck modes
	 * omit it and get plain Scryfall search.
	 */
	getDeckSteering?: (state: SearchState) => DeckSteering;
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- card search shell with several optional deck extension points
export function SearchPanelCore({
	title,
	expanded,
	onToggleExpand,
	onClose,
	onCardClick,
	buildCardMenuItems,
	renderOverlay,
	hideMultilingual = false,
	showTokenMode = false,
	onTokenModeChange,
	renderToggles,
	tabs,
	bodyOverride,
	footer,
	getDeckSteering,
}: SearchPanelCoreProps) {
	const t = useTranslations('decks');
	const [searchName, setSearchName] = useState('');
	const preferredLang = usePreferredCardLang();
	const [includeMultilingual, setIncludeMultilingual] = useState<boolean>(
		() => preferredLang !== undefined && preferredLang !== 'en'
	);
	const [cardMode, setCardMode] = useState<'cards' | 'token'>('cards');
	const [filterModalOpen, setFilterModalOpen] = useState(false);
	const [colors, setColors] = useState<ScryfallColor[]>([]);
	const [colorMatch, setColorMatch] = useState<'exact' | 'include' | 'atMost'>('include');
	const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>([]);
	const [colorIdentityMatch, setColorIdentityMatch] = useState<'atMost' | 'exact'>('atMost');
	const [filterType, setFilterType] = useState<string[]>([]);
	const [filterSet, setFilterSet] = useState('');
	const [rarities, setRarities] = useState<string[]>([]);
	const [oracleText, setOracleText] = useState('');
	const [cmc, setCmc] = useState('');
	const [order, setOrder] = useState<ScryfallSortOrder>('name');
	const [dir, setDir] = useState<ScryfallSortDir>('auto');

	const { sets, isLoading: setsLoading } = useScryfallSets();

	const activeFilterCount =
		colors.length +
		colorIdentity.length +
		(filterType.length > 0 ? 1 : 0) +
		(filterSet ? 1 : 0) +
		rarities.length +
		(oracleText ? 1 : 0) +
		(cmc ? 1 : 0);

	const searchState: SearchState = {
		name: searchName,
		colors,
		colorMatch,
		colorIdentity,
		colorIdentityMatch,
		type: filterType,
		set: filterSet,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
	};

	// Deck steering is a pure function of the live search state (no state writes).
	// Memoised so downstream memos don't rerun on every render.
	const steering: DeckSteering = useMemo(
		() => getDeckSteering?.(searchState) ?? {},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- searchState is a fresh object each render; its primitive parts are the real deps
		[
			getDeckSteering,
			searchName,
			colors,
			colorMatch,
			colorIdentity,
			colorIdentityMatch,
			filterType,
			filterSet,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		]
	);
	const inCollectionOnly = steering.inCollectionOnly ?? false;

	const handleApplyFilters = useCallback(
		(f: {
			colors: ScryfallColor[];
			colorMatch: 'exact' | 'include' | 'atMost';
			colorIdentity: ScryfallColor[];
			colorIdentityMatch: 'atMost' | 'exact';
			type: string[];
			set: string;
			rarities: string[];
			oracleText: string;
			cmc: string;
			order: ScryfallSortOrder;
			dir: ScryfallSortDir;
		}) => {
			setColors(f.colors);
			setColorMatch(f.colorMatch);
			setColorIdentity(f.colorIdentity);
			setColorIdentityMatch(f.colorIdentityMatch);
			setFilterType(f.type);
			setFilterSet(f.set);
			setRarities(f.rarities);
			setOracleText(f.oracleText);
			setCmc(f.cmc);
			setOrder(f.order);
			setDir(f.dir);
		},
		[]
	);

	// In-collection overlay. Collection hooks are page-agnostic (available on
	// every page), so this lives in the core rather than the deck wrapper — it's
	// gated by `inCollectionOnly` which only deck mode ever turns on.
	const emptyEntries = useMemo<Array<{ scryfallId: string; entry: CardEntry }>>(() => [], []);
	const { entries: collectionEntries } = useCollectionContext();
	const { stacks: collectionStacks, isLoading: collectionLoading } = useCollectionCards(
		inCollectionOnly ? collectionEntries : emptyEntries
	);
	const collectionRepresentatives = useMemo(
		() =>
			collectionStacks.map((s) => s.cards[0]).filter((c): c is NonNullable<typeof c> => c != null),
		[collectionStacks]
	);
	const collectionFilters = useMemo<CollectionFilters>(
		() => ({
			...defaultCollectionFilters,
			name: searchName,
			colors,
			colorMatch,
			colorIdentity,
			colorIdentityMatch,
			type: filterType,
			set: filterSet,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		}),
		[
			searchName,
			colors,
			colorMatch,
			colorIdentity,
			colorIdentityMatch,
			filterType,
			filterSet,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		]
	);
	const overlayCards = useMemo(() => {
		if (!inCollectionOnly) return [];
		const base = filterCollectionCards(collectionRepresentatives, collectionFilters);
		return steering.filterCollection ? steering.filterCollection(base) : base;
	}, [inCollectionOnly, collectionRepresentatives, collectionFilters, steering]);

	const isTokenMode = cardMode === 'token';

	const scryfallFilters: SearchFilters = {
		name: inCollectionOnly ? '' : searchName,
		colors: inCollectionOnly ? [] : colors,
		colorMatch: inCollectionOnly ? 'include' : colorMatch,
		type: inCollectionOnly ? [] : filterType,
		set: inCollectionOnly ? '' : filterSet,
		rarities: inCollectionOnly ? [] : rarities,
		oracleText: inCollectionOnly ? '' : oracleText,
		cmc: inCollectionOnly ? '' : cmc,
		legal: inCollectionOnly ? undefined : steering.extraFilters?.legal,
		colorIdentity: inCollectionOnly ? undefined : steering.extraFilters?.colorIdentity,
		colorIdentityMatch,
		matchNothing: inCollectionOnly ? false : (steering.extraFilters?.matchNothing ?? false),
		isToken: isTokenMode,
		order: inCollectionOnly ? 'name' : order,
		dir: inCollectionOnly ? 'auto' : dir,
		includeMultilingual: inCollectionOnly ? false : includeMultilingual,
	};

	const {
		cards: scryfallCards,
		isLoading: scryfallLoading,
		isLoadingMore,
		hasMore,
		loadMore,
	} = useScryfallCardSearch(scryfallFilters);

	const matchNothing = steering.matchNothing ?? false;
	const overlayVisible = matchNothing ? [] : overlayCards;
	const cards = inCollectionOnly ? overlayVisible : scryfallCards;
	const isLoading = inCollectionOnly ? collectionLoading : scryfallLoading;

	const handleTokenModeChange = useCallback(
		(mode: 'cards' | 'token') => {
			setCardMode(mode);
			onTokenModeChange?.(mode === 'token');
		},
		[onTokenModeChange]
	);

	return (
		<aside className={`${styles.panel} ${expanded ? styles.panelExpanded : ''}`}>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
				<div className={styles.headerActions}>
					{onToggleExpand && (
						<button
							type="button"
							className={`${styles.closeBtn} ${styles.expandBtn}`}
							onClick={onToggleExpand}
							aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
						>
							{expanded ? (
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"
										stroke="currentColor"
										strokeWidth="1.8"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							) : (
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
										stroke="currentColor"
										strokeWidth="1.8"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</button>
					)}
					<button
						type="button"
						className={styles.closeBtn}
						onClick={onClose}
						aria-label={t('closePanel')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path
								d="M2 2l12 12M14 2L2 14"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				</div>
			</div>

			{tabs}

			{bodyOverride ?? (
				<>
					<div className={styles.search}>
						<div className={styles.searchRow}>
							<SearchBar
								value={searchName}
								onChange={setSearchName}
								placeholder={t('searchForCard')}
							/>
							<button
								type="button"
								aria-label={t('moreFilters')}
								className={styles.filtersButton}
								onClick={() => setFilterModalOpen(true)}
							>
								<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M2 4h12M4 8h8M6 12h4"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
									/>
								</svg>
								{activeFilterCount > 0 && (
									<span className={styles.filterBadge}>{activeFilterCount}</span>
								)}
							</button>
							{!hideMultilingual && !inCollectionOnly && (
								<SearchAllLanguagesToggle
									value={includeMultilingual}
									onChange={setIncludeMultilingual}
								/>
							)}
							{showTokenMode && (
								<CardModeSwitcher value={cardMode} onChange={handleTokenModeChange} />
							)}
						</div>
						{renderToggles?.()}
					</div>

					<FilterModal
						isOpen={filterModalOpen}
						colors={colors}
						colorMatch={colorMatch}
						colorIdentity={colorIdentity}
						colorIdentityMatch={colorIdentityMatch}
						type={filterType}
						set={filterSet}
						rarities={rarities}
						oracleText={oracleText}
						cmc={cmc}
						sets={sets}
						setsLoading={setsLoading}
						order={order}
						dir={dir}
						onApply={handleApplyFilters}
						onClose={() => setFilterModalOpen(false)}
					/>

					<div className={styles.results}>
						<CardList
							cards={cards}
							isLoading={isLoading}
							isLoadingMore={inCollectionOnly ? false : isLoadingMore}
							hasMore={inCollectionOnly ? false : hasMore}
							onLoadMore={inCollectionOnly ? undefined : loadMore}
							onCardClick={onCardClick}
							buildCardMenuItems={buildCardMenuItems}
							renderOverlay={renderOverlay ?? withCustomBadge}
							viewModes={['grid']}
							pageSize={inCollectionOnly ? undefined : false}
							fluidSections
						/>

						{!isLoading &&
							cards.length === 0 &&
							(searchName.trim() || (inCollectionOnly && activeFilterCount > 0)) && (
								<p className={styles.noResults}>
									{inCollectionOnly ? t('noCollectionMatch') : t('noCardsFound')}
								</p>
							)}
					</div>
				</>
			)}

			{footer}
		</aside>
	);
}
