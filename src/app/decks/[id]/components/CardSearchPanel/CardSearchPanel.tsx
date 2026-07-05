'use client';

import { useState, useCallback, useMemo } from 'react';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { SearchCardContextMenu } from './SearchCardContextMenu';
import { CardModeSwitcher } from './CardModeSwitcher';
import { PanelTabs, type PanelTab } from './PanelTabs';
import { EdhrecRecommendations } from './EdhrecRecommendations';
import { DeckZoneBadges } from './DeckZoneBadges';
import { useDeckCardIndex } from './useDeckCardIndex';
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
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import type { DeckFormat } from '@/types/decks';
import styles from './CardSearchPanel.module.css';

const FORMATS_WITHOUT_LEGALITY: DeckFormat[] = ['draft', 'limited'];
const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

type Props = {
	deckId: string;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	deckFormat?: DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
	commanderName?: string | null;
	onCollectionModeChange?: (inCollectionOnly: boolean) => void;
	expanded?: boolean;
	onToggleExpand?: () => void;
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- deck card search panel with multiple state branches (zone, qty, collection overlay)
export function CardSearchPanel({
	deckId,
	onCardClick,
	onClose,
	deckFormat,
	commanderColorIdentity,
	commanderName,
	onCollectionModeChange,
	expanded = false,
	onToggleExpand,
}: Props) {
	const [searchName, setSearchName] = useState('');
	const [tab, setTab] = useState<PanelTab>('search');
	const [cardMode, setCardMode] = useState<'cards' | 'token'>('cards');
	const [legalOnly, setLegalOnly] = useState(true);
	const [filterModalOpen, setFilterModalOpen] = useState(false);
	const [colors, setColors] = useState<ScryfallColor[]>([]);
	const [colorMatch, setColorMatch] = useState<'exact' | 'include' | 'atMost'>('include');
	const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>([]);
	const [filterType, setFilterType] = useState<string[]>([]);
	const [filterSet, setFilterSet] = useState('');
	const [rarities, setRarities] = useState<string[]>([]);
	const [oracleText, setOracleText] = useState('');
	const [cmc, setCmc] = useState('');
	const [order, setOrder] = useState<ScryfallSortOrder>('name');
	const [dir, setDir] = useState<ScryfallSortDir>('auto');
	const [inCollectionOnly, setInCollectionOnly] = useState(false);

	const emptyEntries = useMemo(() => [], []);

	const { addCardToDeck } = useDeckContext();
	const { getDeckZones } = useDeckCardIndex(deckId);
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const activeFilterCount =
		colors.length +
		colorIdentity.length +
		(filterType.length > 0 ? 1 : 0) +
		(filterSet ? 1 : 0) +
		rarities.length +
		(oracleText ? 1 : 0) +
		(cmc ? 1 : 0);

	const handleApplyFilters = useCallback(
		(f: {
			colors: ScryfallColor[];
			colorMatch: 'exact' | 'include' | 'atMost';
			colorIdentity: ScryfallColor[];
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
	const { entries: collectionEntries } = useCollectionContext();

	const { stacks: collectionStacks, isLoading: collectionLoading } = useCollectionCards(
		inCollectionOnly ? collectionEntries : emptyEntries
	);

	const collectionRepresentatives = useMemo(
		() =>
			collectionStacks.map((s) => s.cards[0]).filter((c): c is NonNullable<typeof c> => c != null),
		[collectionStacks]
	);

	const scryfallIdToOracleId = useMemo(() => {
		const map = new Map<string, string>();
		for (const stack of collectionStacks) {
			for (const card of stack.cards) {
				if (card.oracle_id) map.set(card.id, card.oracle_id);
			}
		}
		return map;
	}, [collectionStacks]);

	const collectionFilters = useMemo<CollectionFilters>(
		() => ({
			...defaultCollectionFilters,
			name: searchName,
			colors,
			colorMatch,
			colorIdentity,
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
			filterType,
			filterSet,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		]
	);

	const showLegalToggle = deckFormat != null && !FORMATS_WITHOUT_LEGALITY.includes(deckFormat);

	const isCommanderFormat = deckFormat != null && COMMANDER_FORMATS.includes(deckFormat);

	const filteredCollectionCards = useMemo(() => {
		if (!inCollectionOnly) return [];
		const filtered = filterCollectionCards(collectionRepresentatives, collectionFilters);
		if (showLegalToggle && legalOnly && deckFormat) {
			const fmt = deckFormat as import('@/lib/scryfall/types/scryfall').ScryfallFormat;
			const legalFiltered = filtered.filter((c) => c.legalities?.[fmt] === 'legal');
			if (isCommanderFormat && commanderColorIdentity && commanderColorIdentity.length > 0) {
				return legalFiltered.filter((c) =>
					(c.color_identity ?? []).every((ci) => commanderColorIdentity.includes(ci))
				);
			}
			return legalFiltered;
		}
		return filtered;
	}, [
		inCollectionOnly,
		collectionRepresentatives,
		collectionFilters,
		showLegalToggle,
		legalOnly,
		deckFormat,
		isCommanderFormat,
		commanderColorIdentity,
	]);

	const {
		menu: contextMenu,
		open: openContextMenu,
		close: closeContextMenu,
	} = useContextMenu<ScryfallCard>();

	const isTokenMode = cardMode === 'token';
	// Tokens have no format legality, so never constrain the token search by legal/color identity.
	const legalFilter = !isTokenMode && showLegalToggle && legalOnly ? deckFormat : undefined;
	const colorIdentityFilter = legalFilter && isCommanderFormat ? commanderColorIdentity : undefined;

	// User's color-identity selection combines with the commander constraint (both are
	// "at most" ci<= sets), so the effective allowance is their intersection.
	let effectiveColorIdentity: ScryfallColor[];
	if (colorIdentityFilter && colorIdentityFilter.length > 0) {
		effectiveColorIdentity =
			colorIdentity.length > 0
				? colorIdentity.filter((c) => colorIdentityFilter.includes(c))
				: colorIdentityFilter;
	} else {
		effectiveColorIdentity = colorIdentity;
	}
	const colorIdentityToApply =
		effectiveColorIdentity.length > 0 ? effectiveColorIdentity : undefined;

	// The user made a real (non-empty) selection, a commander constraint exists, and the
	// two are disjoint: no card can satisfy both, so the search must yield zero results.
	const userCiDisjoint =
		!!colorIdentityFilter &&
		colorIdentityFilter.length > 0 &&
		colorIdentity.length > 0 &&
		effectiveColorIdentity.length === 0;

	const scryfallFilters: SearchFilters = {
		name: inCollectionOnly ? '' : searchName,
		colors: inCollectionOnly ? [] : colors,
		colorMatch: inCollectionOnly ? 'include' : colorMatch,
		type: inCollectionOnly ? [] : filterType,
		set: inCollectionOnly ? '' : filterSet,
		rarities: inCollectionOnly ? [] : rarities,
		oracleText: inCollectionOnly ? '' : oracleText,
		cmc: inCollectionOnly ? '' : cmc,
		legal: inCollectionOnly ? undefined : legalFilter,
		colorIdentity: inCollectionOnly ? undefined : colorIdentityToApply,
		matchNothing: inCollectionOnly ? false : userCiDisjoint,
		isToken: isTokenMode,
		order: inCollectionOnly ? 'name' : order,
		dir: inCollectionOnly ? 'auto' : dir,
	};

	const {
		cards: scryfallCards,
		isLoading: scryfallLoading,
		isLoadingMore,
		hasMore,
		loadMore,
	} = useScryfallCardSearch(scryfallFilters);

	const inCollectionCards = userCiDisjoint ? [] : filteredCollectionCards;
	const cards = inCollectionOnly ? inCollectionCards : scryfallCards;
	const isLoading = inCollectionOnly ? collectionLoading : scryfallLoading;

	const showEdhrecTab = isCommanderFormat && !!commanderName;
	const activeTab = showEdhrecTab ? tab : 'search';

	const handleAddCardClick = useCallback(
		(card: AnyCard) => {
			let scryfallCard: ScryfallCard;
			if ('entry' in card) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { entry: _, ...rest } = card as import('@/types/cards').Card;
				scryfallCard = rest as ScryfallCard;
			} else {
				scryfallCard = card as ScryfallCard;
			}
			if (isTokenMode) {
				addCardToDeck(deckId, scryfallCard, 'tokens');
			} else {
				onCardClick(scryfallCard);
			}
		},
		[isTokenMode, addCardToDeck, deckId, onCardClick]
	);

	const renderSearchOverlay = useCallback(
		(card: AnyCard) => (
			<>
				<div
					className={styles.searchCardOverlay}
					onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
				/>
				<DeckZoneBadges zones={getDeckZones(card.oracle_id)} />
			</>
		),
		[openContextMenu, getDeckZones]
	);

	return (
		<aside className={`${styles.panel} ${expanded ? styles.panelExpanded : ''}`}>
			<div className={styles.header}>
				<span className={styles.title}>Add Cards</span>
				<div className={styles.headerActions}>
					{onToggleExpand && (
						<button
							type="button"
							className={styles.closeBtn}
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
						aria-label="Close panel"
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

			{showEdhrecTab && <PanelTabs value={activeTab} onChange={setTab} />}

			{activeTab === 'edhrec' ? (
				<EdhrecRecommendations
					commanderName={commanderName ?? null}
					onCardClick={handleAddCardClick}
					renderOverlay={renderSearchOverlay}
				/>
			) : (
				<>
					<div className={styles.search}>
						<div className={styles.searchRow}>
							<SearchBar
								value={searchName}
								onChange={setSearchName}
								placeholder="Search for a card..."
							/>
							<CardModeSwitcher value={cardMode} onChange={setCardMode} />
							<button
								type="button"
								aria-label="More filters"
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
						</div>
						{showLegalToggle && (
							<label className={styles.toggleLabel}>
								<input
									type="checkbox"
									checked={legalOnly}
									onChange={(e) => setLegalOnly(e.target.checked)}
									className={styles.toggleInput}
								/>
								<span className={styles.toggleText}>Legal in {deckFormat} only</span>
							</label>
						)}
						<label className={styles.toggleLabel}>
							<input
								type="checkbox"
								checked={inCollectionOnly}
								onChange={(e) => {
									const next = e.target.checked;
									setInCollectionOnly(next);
									onCollectionModeChange?.(next);
								}}
								className={styles.toggleInput}
							/>
							<span className={styles.toggleText}>In collection only</span>
						</label>
					</div>

					<FilterModal
						isOpen={filterModalOpen}
						colors={colors}
						colorMatch={colorMatch}
						colorIdentity={colorIdentity}
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
							onCardClick={handleAddCardClick}
							renderOverlay={renderSearchOverlay}
							viewModes={['grid']}
							pageSize={inCollectionOnly ? undefined : false}
							fluidSections
						/>

						{!isLoading &&
							cards.length === 0 &&
							(searchName.trim() || (inCollectionOnly && activeFilterCount > 0)) && (
								<p className={styles.noResults}>
									{inCollectionOnly
										? 'No cards in your collection match these filters'
										: 'No cards found'}
								</p>
							)}
					</div>
				</>
			)}

			{contextMenu && (
				<SearchCardContextMenu
					card={contextMenu.data}
					position={contextMenu.position}
					deckId={deckId}
					format={deckFormat}
					onCardClick={onCardClick}
					onClose={closeContextMenu}
					inCollectionOnly={inCollectionOnly}
					collectionEntries={collectionEntries}
					scryfallIdToOracleId={scryfallIdToOracleId}
				/>
			)}
		</aside>
	);
}
