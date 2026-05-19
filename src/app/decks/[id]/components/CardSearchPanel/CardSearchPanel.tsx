'use client';

import { useState, useCallback, useMemo } from 'react';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { FilterModal } from '@/lib/search/components/FilterModal/FilterModal';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { SearchCardContextMenu } from './SearchCardContextMenu';
import {
	useScryfallCardSearch,
	type SearchFilters,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import {
	filterCollectionCards,
	defaultCollectionFilters,
} from '@/app/collection/utils/filterCollectionCards';
import type { CollectionFilters } from '@/app/collection/utils/filterCollectionCards';
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
};

export function CardSearchPanel({
	deckId,
	onCardClick,
	onClose,
	deckFormat,
	commanderColorIdentity,
}: Props) {
	const [searchName, setSearchName] = useState('');
	const [legalOnly, setLegalOnly] = useState(true);
	const [filterModalOpen, setFilterModalOpen] = useState(false);
	const [colors, setColors] = useState<ScryfallColor[]>([]);
	const [colorMatch, setColorMatch] = useState<'exact' | 'include' | 'atMost'>('include');
	const [filterType, setFilterType] = useState('');
	const [filterSet, setFilterSet] = useState('');
	const [rarities, setRarities] = useState<string[]>([]);
	const [oracleText, setOracleText] = useState('');
	const [cmc, setCmc] = useState('');
	const [order, setOrder] = useState<ScryfallSortOrder>('name');
	const [dir, setDir] = useState<ScryfallSortDir>('auto');
	const [inCollectionOnly, setInCollectionOnly] = useState(false);

	const emptyEntries = useMemo(() => [], []);

	const { sets, isLoading: setsLoading } = useScryfallSets();

	const activeFilterCount =
		colors.length +
		(filterType ? 1 : 0) +
		(filterSet ? 1 : 0) +
		rarities.length +
		(oracleText ? 1 : 0) +
		(cmc ? 1 : 0);

	const handleApplyFilters = useCallback(
		(f: {
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
			setColors(f.colors);
			setColorMatch(f.colorMatch);
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

	const collectionFilters = useMemo<CollectionFilters>(
		() => ({
			...defaultCollectionFilters,
			name: searchName,
			colors,
			colorMatch,
			type: filterType,
			set: filterSet,
			rarities,
			oracleText,
			cmc,
			order,
			dir,
		}),
		[searchName, colors, colorMatch, filterType, filterSet, rarities, oracleText, cmc, order, dir]
	);

	const showLegalToggle = deckFormat != null && !FORMATS_WITHOUT_LEGALITY.includes(deckFormat);

	const isCommanderFormat = deckFormat != null && COMMANDER_FORMATS.includes(deckFormat);

	const filteredCollectionCards = useMemo(() => {
		if (!inCollectionOnly) return [];
		const filtered = filterCollectionCards(collectionRepresentatives, collectionFilters);
		if (showLegalToggle && legalOnly && deckFormat) {
			const fmt = deckFormat as import('@/lib/scryfall/types/scryfall').ScryfallFormat;
			const legalFiltered = filtered.filter((c) => c.legalities[fmt] === 'legal');
			if (isCommanderFormat && commanderColorIdentity && commanderColorIdentity.length > 0) {
				return legalFiltered.filter((c) =>
					c.color_identity.every((ci) => commanderColorIdentity.includes(ci))
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

	const legalFilter = showLegalToggle && legalOnly ? deckFormat : undefined;
	const colorIdentityFilter = legalFilter && isCommanderFormat ? commanderColorIdentity : undefined;

	const scryfallFilters: SearchFilters = {
		name: inCollectionOnly ? '' : searchName,
		colors: inCollectionOnly ? [] : colors,
		colorMatch: inCollectionOnly ? 'include' : colorMatch,
		type: inCollectionOnly ? '' : filterType,
		set: inCollectionOnly ? '' : filterSet,
		rarities: inCollectionOnly ? [] : rarities,
		oracleText: inCollectionOnly ? '' : oracleText,
		cmc: inCollectionOnly ? '' : cmc,
		legal: inCollectionOnly ? undefined : legalFilter,
		colorIdentity: inCollectionOnly ? undefined : colorIdentityFilter,
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

	const cards = inCollectionOnly ? filteredCollectionCards : scryfallCards;
	const isLoading = inCollectionOnly ? collectionLoading : scryfallLoading;

	const renderSearchOverlay = useCallback(
		(card: AnyCard) => (
			<div
				className={styles.searchCardOverlay}
				onContextMenu={(e) => openContextMenu(card as ScryfallCard, e)}
			/>
		),
		[openContextMenu]
	);

	return (
		<aside className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>Add Cards</span>
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

			<div className={styles.search}>
				<div className={styles.searchRow}>
					<SearchBar
						value={searchName}
						onChange={setSearchName}
						placeholder="Search for a card..."
					/>
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
						onChange={(e) => setInCollectionOnly(e.target.checked)}
						className={styles.toggleInput}
					/>
					<span className={styles.toggleText}>In collection only</span>
				</label>
			</div>

			<FilterModal
				isOpen={filterModalOpen}
				colors={colors}
				colorMatch={colorMatch}
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
					onCardClick={(card: AnyCard) => onCardClick(card as ScryfallCard)}
					renderOverlay={renderSearchOverlay}
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

			{contextMenu && (
				<SearchCardContextMenu
					card={contextMenu.data}
					position={contextMenu.position}
					deckId={deckId}
					format={deckFormat}
					onCardClick={onCardClick}
					onClose={closeContextMenu}
				/>
			)}
		</aside>
	);
}
