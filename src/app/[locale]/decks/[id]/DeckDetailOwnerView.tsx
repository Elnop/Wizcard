'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { validateDeck } from '@/lib/deck/utils/format-rules';
import { Spinner } from '@/components/Spinner/Spinner';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { getDeckZone } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { findFreeCollectionCopy } from '@/lib/deck/utils/collectionCopyResolver';
import { useDeckDetail, type ResolvedDeckCard } from './useDeckDetail';
import { useDeckCardSections, dedupeByOracle } from './useDeckCardSections';
import { DeckHeader } from './components/DeckHeader/DeckHeader';
import { DeckStats } from './components/DeckStats/DeckStats';
import { SampleHand } from './components/SampleHand/SampleHand';
import { DeckCardOverlay } from './components/DeckCardOverlay/DeckCardOverlay';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { DeckFooter } from './components/DeckFooter/DeckFooter';
import { CardSearchPanel } from './components/CardSearchPanel/CardSearchPanel';
import { Button } from '@/components/Button/Button';
import { PlusIcon } from '@phosphor-icons/react';
import { useAddDeckToCollection } from './useAddDeckToCollection';
import { AddDeckToCollectionModal } from './components/AddDeckToCollectionModal/AddDeckToCollectionModal';
import { AddCardToCollectionModal } from './components/AddCardToCollectionModal/AddCardToCollectionModal';
import {
	RemoveDeckCardModal,
	type RemoveDeckCardMembership,
} from './components/RemoveDeckCardModal/RemoveDeckCardModal';
import { BulkRemoveDeckCardsModal } from './components/RemoveDeckCardModal/BulkRemoveDeckCardsModal';
import { DeckBulkActionBar } from './components/DeckBulkActionBar/DeckBulkActionBar';
import { SectionSelectButton } from './components/DeckBulkActionBar/SectionSelectButton';
import {
	DeckBulkEditModal,
	type DeckBulkEdit,
} from './components/DeckBulkEditModal/DeckBulkEditModal';
import { useDeckBulkSelection } from './useDeckBulkSelection';
import { type CollectionAddRequest } from './collectionAddRequest';
import { DeckPdfExportModal } from './components/DeckPdfExportModal/DeckPdfExportModal';
import { DeckTextExportModal } from './components/DeckTextExportModal/DeckTextExportModal';
import { ImportListIntoDeckModal } from './components/ImportListIntoDeckModal/ImportListIntoDeckModal';
import { serializeDecklist } from '@/lib/deck/utils/serialize-decklist';
import type { DeckPdfExportOptions } from '@/lib/pdf/types';
import { PdfSettingsModal } from '@/components/PdfSettingsModal/PdfSettingsModal';
import { generateCardsPdf } from '@/lib/pdf/generateCardsPdf';
import { filterCardsForPdf } from '@/lib/pdf/filterCardsForPdf';
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
import { useDeckSort } from './useDeckSort';
import { useDeckTokens } from './useDeckTokens';
import { DeckSortBar } from './components/DeckSortBar/DeckSortBar';
import { DeckTokens } from './components/DeckTokens/DeckTokens';
import type { DeckGroupBy } from './useDeckCardSections';
import styles from './page.module.css';

export default function DeckDetailOwnerView({ deckId }: { deckId: string }) {
	const t = useTranslations('decks');
	const {
		decks: allDecks,
		updateDeck,
		addCardToDeck,
		addCollectionCardToDeck,
		removeCardFromDeck,
		changeZone,
		updateDeckCard,
		toggleOwned,
		toggleDeckCardWishlist,
		getDeckCards,
		replaceDeckCardWithCollectionCopy,
	} = useDeckContext();
	const deckCards = getDeckCards(deckId);
	const { deck, cardsByZone, resolvedCards, stats, coverArtUrl, isLoading, isResolving } =
		useDeckDetail(deckId);

	const [searchPanelOpen, setSearchPanelOpen] = useState(false);
	const [searchPanelExpanded, setSearchPanelExpanded] = useState(false);
	const [panelSelectedCard, setPanelSelectedCard] = useState<ScryfallCard | null>(null);
	const [panelInCollectionOnly, setPanelInCollectionOnly] = useState(false);
	const [pendingCollectionAdd, setPendingCollectionAdd] = useState<CollectionAddRequest | null>(
		null
	);
	const [pendingRemove, setPendingRemove] = useState<{
		rowId: string;
		cardName: string;
		membership: RemoveDeckCardMembership;
	} | null>(null);

	const [contextMenuCard, setContextMenuCard] = useState<AnyCard | null>(null);
	const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

	const bulk = useDeckBulkSelection();
	const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
	const [bulkRemove, setBulkRemove] = useState<{ hasOwned: boolean; hasWishlist: boolean } | null>(
		null
	);
	const [addToCollectionModalOpen, setAddToCollectionModalOpen] = useState(false);
	const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
	const [pdfSettingsModalOpen, setPdfSettingsModalOpen] = useState(false);
	const [pdfExportOptions, setPdfExportOptions] = useState<DeckPdfExportOptions | null>(null);
	const [pdfGenerating, setPdfGenerating] = useState(false);
	const [textExportModalOpen, setTextExportModalOpen] = useState(false);
	const [importListOpen, setImportListOpen] = useState(false);
	const existingOracleIds = useMemo(
		() => new Set(resolvedCards.map((c) => c.oracle_id ?? c.id)),
		[resolvedCards]
	);
	const pdfFilteredCards = useMemo(
		() => (pdfExportOptions ? filterCardsForPdf(resolvedCards, pdfExportOptions) : []),
		[resolvedCards, pdfExportOptions]
	);
	const decklistText = useMemo(() => serializeDecklist(cardsByZone), [cardsByZone]);

	const showCommander = deck?.format === 'commander' || deck?.format === 'brawl';

	const { order, dir, setOrder, setDir, sortCards } = useDeckSort();
	const [groupBy, setGroupBy] = useState<DeckGroupBy>('type');

	const zones: DeckZone[] = useMemo(
		() =>
			showCommander
				? ['commander', 'mainboard', 'sideboard', 'maybeboard']
				: ['mainboard', 'sideboard', 'maybeboard'],
		[showCommander]
	);

	const pdfZones: DeckZone[] = useMemo(
		() => (cardsByZone.tokens.length > 0 ? [...zones, 'tokens'] : zones),
		[zones, cardsByZone.tokens]
	);

	const { sections, groupByCardId } = useDeckCardSections(
		cardsByZone,
		showCommander,
		sortCards,
		groupBy
	);
	// The tokens panel shows one card per logical token (the per-stack count is
	// rendered by the card overlay). Render deduped representatives so two copies
	// of the same token don't appear as two separate stacks.
	const tokenCards = useMemo(() => dedupeByOracle(cardsByZone.tokens), [cardsByZone.tokens]);
	const { addTokens, isAdding: isAddingTokens } = useDeckTokens(deckId, cardsByZone, tokenCards);
	const symbolMap = useScryfallSymbols();

	const { openDeckCardModal } = useCardModalContext();

	const { entries } = useCollectionContext();
	const { addToWishlist, entries: wishlistEntries } = useWishlistContext();

	const deckNameById = useMemo(() => new Map(allDecks.map((d) => [d.id, d.name])), [allDecks]);

	const deckNameResolver = useCallback((id: string) => deckNameById.get(id), [deckNameById]);

	// Always resolve collection stacks so oracle_id lookups work for assign-all
	const { stacks: collectionStacks } = useCollectionCards(entries);

	const collectionScryfallIdToOracleId = useMemo(() => {
		const map = new Map<string, string>();
		// Deck prints first
		for (const rc of resolvedCards) {
			if (rc.oracle_id) map.set(rc.id, rc.oracle_id);
		}
		// Collection prints (may be different editions)
		for (const stack of collectionStacks) {
			for (const card of stack.cards) {
				if (card.oracle_id) map.set(card.id, card.oracle_id);
			}
		}
		return map;
	}, [resolvedCards, collectionStacks]);

	// Reverse map: oracle_id → all scryfallIds known from collection + deck entries
	const oracleIdToAllScryfallIds = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const [scryfallId, oracleId] of collectionScryfallIdToOracleId) {
			let set = map.get(oracleId);
			if (!set) {
				set = new Set();
				map.set(oracleId, set);
			}
			set.add(scryfallId);
		}
		// Also add scryfallIds from collection entries directly (covers locked copies)
		for (const e of entries) {
			const oracleId = collectionScryfallIdToOracleId.get(e.scryfallId);
			if (oracleId) {
				map.get(oracleId)?.add(e.scryfallId);
			}
		}
		return map;
	}, [collectionScryfallIdToOracleId, entries]);

	const panelScryfallIdToOracleId = collectionScryfallIdToOracleId;

	const handleCardClick = useCallback(
		(card: AnyCard) => {
			if (bulk.selectMode) {
				const c = card as ResolvedDeckCard;
				bulk.toggle(c.oracle_id ?? c.id);
				return;
			}
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id ?? c.id);
			if (group) openDeckCardModal(deckId, group, c.entry.rowId);
		},
		[bulk, groupByCardId, openDeckCardModal, deckId]
	);

	const tableColumns: CardListColumn[] = useMemo(
		() => [
			{
				key: 'qty',
				label: t('colQty'),
				render: (card) => {
					const c = card as ResolvedDeckCard;
					const zone = getDeckZone(c.entry.tags);
					return groupByCardId.get(c.oracle_id ?? c.id)?.byZone.get(zone)?.length ?? 1;
				},
			},
			{ key: 'name', label: t('colName') },
			{ key: 'type_line', label: t('colType') },
			{
				key: 'mana_cost',
				label: t('colMana'),
				render: (card) => {
					const cost = 'mana_cost' in card ? (card.mana_cost as string) : '';
					if (!cost) return '—';
					return <SymbolText text={cost} symbolMap={symbolMap} />;
				},
			},
			{
				key: 'set',
				label: t('colSet'),
				render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
			},
		],
		[groupByCardId, symbolMap, t]
	);

	// Tokens have no deck quantity or relevant mana cost; show identity-focused
	// columns instead of reusing the main deck columns.
	const tokenTableColumns: CardListColumn[] = useMemo(
		() => [
			{ key: 'name', label: t('colName') },
			{ key: 'type_line', label: t('colType') },
			{
				key: 'pt',
				label: t('colPf'),
				render: (card) => {
					const power = 'power' in card ? (card.power as string | undefined) : undefined;
					const toughness =
						'toughness' in card ? (card.toughness as string | undefined) : undefined;
					return power != null && toughness != null ? `${power}/${toughness}` : '—';
				},
			},
		],
		[t]
	);

	const warnings = useMemo(() => {
		if (!deck) return [];
		const allCards = resolvedCards.filter((rc) => {
			const zone = getDeckZone(rc.entry.tags);
			return zone !== 'commander' && zone !== 'tokens';
		});
		const commanderCards = resolvedCards.filter((rc) => getDeckZone(rc.entry.tags) === 'commander');
		return validateDeck(
			deck.format,
			allCards.map((rc) => ({ card: rc as ScryfallCard, zone: getDeckZone(rc.entry.tags) })),
			commanderCards.map((rc) => ({ card: rc as ScryfallCard, zone: getDeckZone(rc.entry.tags) }))
		);
	}, [deck, resolvedCards]);

	const commanderColorIdentity = useMemo((): ScryfallColor[] | undefined => {
		if (!showCommander) return undefined;
		const commanderCards = resolvedCards.filter((rc) => getDeckZone(rc.entry.tags) === 'commander');
		if (commanderCards.length === 0) return undefined;
		const identity = new Set<ScryfallColor>();
		for (const rc of commanderCards) {
			for (const color of rc.color_identity ?? []) {
				identity.add(color as ScryfallColor);
			}
		}
		return identity.size > 0 ? [...identity] : undefined;
	}, [showCommander, resolvedCards]);

	const commanderName = useMemo((): string | null => {
		if (!showCommander) return null;
		const commander = resolvedCards.find((rc) => getDeckZone(rc.entry.tags) === 'commander');
		return commander?.name ?? null;
	}, [showCommander, resolvedCards]);

	const handleDuplicateCard = useCallback(
		(rc: ResolvedDeckCard) => {
			addCardToDeck(deckId, rc as ScryfallCard, getDeckZone(rc.entry.tags));
		},
		[deckId, addCardToDeck]
	);

	// Removing a deck card that is also in the collection (owned) or wishlist must
	// ask whether to remove it there too. owned and wishlist are mutually exclusive.
	const handleRemoveRequest = useCallback(
		(rowId: string) => {
			const copy = deckCards[rowId];
			let membership: RemoveDeckCardMembership | null = null;
			if (copy?.entry.ownerId) membership = 'collection';
			else if (copy?.entry.wishlist) membership = 'wishlist';
			if (!copy || membership === null) {
				removeCardFromDeck(rowId);
				return;
			}
			const name = resolvedCards.find((rc) => rc.entry.rowId === rowId)?.name ?? '';
			setPendingRemove({ rowId, cardName: name, membership });
		},
		[deckCards, removeCardFromDeck, resolvedCards]
	);

	const allOracleKeys = useMemo(() => Array.from(groupByCardId.keys()), [groupByCardId]);
	const allSelected = useMemo(
		() => allOracleKeys.length > 0 && allOracleKeys.every((k) => bulk.selected.has(k)),
		[allOracleKeys, bulk.selected]
	);

	// In select mode, give every section and sub-section a "select all" toggle in
	// its header. The toggle acts on the union of that section's own cards plus
	// any descendant sub-section cards (keyed by oracle_id, the selection key).
	const sectionsWithSelectAll = useMemo(() => {
		if (!bulk.selectMode) return sections;
		const decorate = (section: CardListSection): CardListSection => {
			const children = section.children?.map(decorate);
			const keys = new Set<string>();
			for (const card of section.cards) keys.add((card as ResolvedDeckCard).oracle_id ?? card.id);
			for (const child of children ?? []) {
				for (const card of child.cards) keys.add((card as ResolvedDeckCard).oracle_id ?? card.id);
			}
			const keyList = [...keys];
			return {
				...section,
				children,
				headerActions: (
					<SectionSelectButton
						allSelected={bulk.areAllSelected(keyList)}
						onToggle={() => bulk.toggleKeys(keyList)}
					/>
				),
			};
		};
		return sections.map(decorate);
	}, [sections, bulk]);

	const handleBulkAddToWishlist = useCallback(() => {
		// Flag the wishlist on every copy of each selected card. Skip copies that
		// are already wishlisted so bulk add never toggles one back off.
		for (const rowId of bulk.selectedRowIds(groupByCardId)) {
			if (deckCards[rowId]?.entry.wishlist) continue;
			toggleDeckCardWishlist(rowId);
		}
		bulk.exit();
	}, [bulk, groupByCardId, deckCards, toggleDeckCardWishlist]);

	const handleBulkAddToCollectionSelection = useCallback(() => {
		// Mark every un-owned selected copy as owned (non-proxy), mirroring the
		// per-card "Add to collection" action.
		for (const rowId of bulk.selectedRowIds(groupByCardId, (c) => !c.entry.ownerId)) {
			toggleOwned(rowId, false);
		}
		bulk.exit();
	}, [bulk, groupByCardId, toggleOwned]);

	const handleBulkEditApply = useCallback(
		({ patch, zone }: DeckBulkEdit) => {
			const rowIds = bulk.selectedRowIds(groupByCardId);
			const hasPatch = Object.keys(patch).length > 0;
			for (const rowId of rowIds) {
				if (zone) changeZone(rowId, zone);
				if (hasPatch) updateDeckCard(rowId, patch);
			}
			setBulkEditModalOpen(false);
			bulk.exit();
		},
		[bulk, groupByCardId, changeZone, updateDeckCard]
	);

	const handleBulkRemoveRequest = useCallback(() => {
		const rowIds = bulk.selectedRowIds(groupByCardId);
		const hasOwned = rowIds.some((rowId) => deckCards[rowId]?.entry.ownerId);
		const hasWishlist = rowIds.some((rowId) => deckCards[rowId]?.entry.wishlist);
		setBulkRemove({ hasOwned, hasWishlist });
	}, [bulk, groupByCardId, deckCards]);

	const handleBulkRemoveConfirm = useCallback(
		({
			alsoRemoveCollection,
			alsoRemoveWishlist,
		}: {
			alsoRemoveCollection: boolean;
			alsoRemoveWishlist: boolean;
		}) => {
			for (const rowId of bulk.selectedRowIds(groupByCardId)) {
				const entry = deckCards[rowId]?.entry;
				let mode: 'delete' | 'detach' = 'delete';
				if (entry?.ownerId) mode = alsoRemoveCollection ? 'delete' : 'detach';
				else if (entry?.wishlist) mode = alsoRemoveWishlist ? 'delete' : 'detach';
				removeCardFromDeck(rowId, mode);
			}
			setBulkRemove(null);
			bulk.exit();
		},
		[bulk, groupByCardId, deckCards, removeCardFromDeck]
	);

	const handleAssignAllFromCollection = useCallback(() => {
		for (const rc of resolvedCards) {
			if (rc.entry.ownerId) continue;
			const zone = getDeckZone(rc.entry.tags);
			const liveEntries = Object.values(useCollectionStore.getState().entries);
			const copy = findFreeCollectionCopy(
				rc.id,
				rc.oracle_id ?? '',
				liveEntries,
				collectionScryfallIdToOracleId
			);
			if (copy) {
				replaceDeckCardWithCollectionCopy(rc.entry.rowId, copy.rowId, deckId, zone);
			}
		}
	}, [resolvedCards, collectionScryfallIdToOracleId, deckId, replaceDeckCardWithCollectionCopy]);

	const {
		zoneStats,
		availableZones,
		execute: executeAddToCollection,
	} = useAddDeckToCollection(resolvedCards);

	const renderOverlay = useCallback(
		(card: AnyCard) => {
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id ?? c.id);
			const currentZone = getDeckZone(c.entry.tags);
			if (!group) return null;

			if (bulk.selectMode) {
				const checked = bulk.selected.has(c.oracle_id ?? c.id);
				return withCustomBadge(
					card,
					<div
						style={{
							position: 'absolute',
							inset: 0,
							pointerEvents: 'none',
							display: 'flex',
							alignItems: 'flex-start',
							justifyContent: 'flex-start',
							padding: '8px',
							background: checked ? 'rgba(124,106,245,0.18)' : 'transparent',
							border: checked ? '2px solid rgba(124,106,245,0.7)' : '2px solid transparent',
							borderRadius: '4px',
							boxSizing: 'border-box',
						}}
					>
						<input
							type="checkbox"
							checked={checked}
							readOnly
							style={{ width: 18, height: 18, cursor: 'pointer', pointerEvents: 'none' }}
						/>
					</div>
				);
			}

			const deckScryfallIds = Array.from(group.byZone.values())
				.flat()
				.map((rc) => rc.id);
			const collectionIds = oracleIdToAllScryfallIds.get(c.oracle_id ?? c.id);
			const oracleScryfallIds = Array.from(new Set([...deckScryfallIds, ...(collectionIds ?? [])]));

			const firstCopy = group.byZone.get(currentZone)?.[0];
			const isContextCard = contextMenuCard === card;
			return withCustomBadge(
				card,
				<DeckCardOverlay
					group={group}
					currentZone={currentZone}
					zones={zones}
					deckId={deckId}
					oracleScryfallIds={oracleScryfallIds}
					deckNameResolver={deckNameResolver}
					onDuplicate={handleDuplicateCard}
					onRemove={handleRemoveRequest}
					onChangeZone={changeZone}
					onBadgeClick={() =>
						openDeckCardModal(deckId, group, firstCopy?.entry.rowId ?? c.entry.rowId)
					}
					onAddToCollectionClick={(req) => {
						if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
					}}
					onAddToWishlist={(deckCardRowId) => {
						toggleDeckCardWishlist(deckCardRowId);
					}}
					wishlistEntries={wishlistEntries}
					deckCoverArtUrl={deck?.coverArtUrl ?? null}
					onSetCover={(url) => updateDeck(deckId, { coverArtUrl: url })}
					onResetCover={() => updateDeck(deckId, { coverArtUrl: null })}
					contextMenuPos={isContextCard ? contextMenuPos : null}
					onContextMenuClose={() => setContextMenuPos(null)}
				/>
			);
		},
		[
			groupByCardId,
			bulk.selectMode,
			bulk.selected,
			zones,
			deckId,
			deckNameResolver,
			oracleIdToAllScryfallIds,
			handleDuplicateCard,
			handleRemoveRequest,
			changeZone,
			openDeckCardModal,
			toggleDeckCardWishlist,
			wishlistEntries,
			deck?.coverArtUrl,
			updateDeck,
			contextMenuCard,
			contextMenuPos,
		]
	);

	const handleCardContextMenu = useCallback((card: AnyCard, e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenuCard(card);
		setContextMenuPos({ x: e.clientX, y: e.clientY });
	}, []);

	if (isLoading) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	if (!deck) {
		return (
			<div className={styles.page}>
				<div className={styles.notFound}>
					<h2>{t('deckNotFound')}</h2>
				</div>
			</div>
		);
	}

	return (
		<div
			className={styles.page}
			style={coverArtUrl ? { ['--cover-art' as string]: `url("${coverArtUrl}")` } : undefined}
		>
			<div className={styles.bg} aria-hidden="true">
				<div className={styles.bgArt} />
				<div className={styles.bgScrim} />
				<div className={styles.bgGrain} />
				<div className={styles.bgVignette} />
			</div>
			<div
				className={`${styles.layout} ${searchPanelOpen && !searchPanelExpanded ? styles.layoutWithPanel : ''}`}
			>
				<div className={styles.content}>
					<DeckHeader
						deck={deck}
						onUpdate={(updates) => updateDeck(deckId, updates)}
						onAssignAllFromCollection={handleAssignAllFromCollection}
						onAddAllToCollection={() => setAddToCollectionModalOpen(true)}
						onImportList={() => setImportListOpen(true)}
						onGeneratePdf={() => setPdfExportModalOpen(true)}
						onExportText={() => setTextExportModalOpen(true)}
						selectMode={bulk.selectMode}
						onToggleSelectMode={bulk.toggleMode}
					/>

					<DeckSortBar
						order={order}
						dir={dir}
						onOrderChange={setOrder}
						onDirChange={setDir}
						groupBy={groupBy}
						onGroupByChange={setGroupBy}
					/>

					{isResolving && Object.keys(deckCards).length > 0 && (
						<div className={styles.resolving}>
							<Spinner /> Loading card data...
						</div>
					)}

					<CardList
						cards={sectionsWithSelectAll}
						isLoading={isResolving && resolvedCards.length === 0}
						skeletonCount={Object.keys(deckCards).length || undefined}
						renderOverlay={renderOverlay}
						onCardClick={handleCardClick}
						onCardContextMenu={bulk.selectMode ? undefined : handleCardContextMenu}
						tableColumns={tableColumns}
						pageSize={false}
						viewModes={['fluid-grid', 'grid', 'table']}
						cardGap="compact"
						showCardNames={false}
					/>

					<DeckTokens
						tokens={tokenCards}
						scanZones={zones}
						onAddTokens={addTokens}
						isAdding={isAddingTokens}
						renderOverlay={renderOverlay}
						onCardClick={handleCardClick}
						onCardContextMenu={handleCardContextMenu}
						tableColumns={tokenTableColumns}
					/>

					<DeckStats stats={stats} warnings={warnings} />
					<SampleHand mainboard={cardsByZone.mainboard} />
				</div>

				{searchPanelOpen && (
					<CardSearchPanel
						deckId={deckId}
						onCardClick={setPanelSelectedCard}
						onClose={() => {
							setSearchPanelOpen(false);
							setSearchPanelExpanded(false);
						}}
						deckFormat={deck.format}
						commanderColorIdentity={commanderColorIdentity}
						commanderName={commanderName}
						onCollectionModeChange={setPanelInCollectionOnly}
						expanded={searchPanelExpanded}
						onToggleExpand={() => setSearchPanelExpanded((v) => !v)}
					/>
				)}
			</div>

			{bulk.selectMode && (
				<DeckBulkActionBar
					selectedCount={bulk.selected.size}
					allSelected={allSelected}
					onToggleSelectAll={() => bulk.toggleSelectAll(allOracleKeys)}
					onBulkEdit={() => setBulkEditModalOpen(true)}
					onBulkAddToCollection={handleBulkAddToCollectionSelection}
					onBulkAddToWishlist={handleBulkAddToWishlist}
					onBulkRemove={handleBulkRemoveRequest}
					onClear={bulk.clear}
					onExit={bulk.exit}
				/>
			)}

			{bulkEditModalOpen && (
				<DeckBulkEditModal
					cardCount={bulk.selected.size}
					zones={zones}
					onApply={handleBulkEditApply}
					onClose={() => setBulkEditModalOpen(false)}
				/>
			)}

			{bulkRemove && (
				<BulkRemoveDeckCardsModal
					cardCount={bulk.selected.size}
					hasOwned={bulkRemove.hasOwned}
					hasWishlist={bulkRemove.hasWishlist}
					onConfirm={handleBulkRemoveConfirm}
					onClose={() => setBulkRemove(null)}
				/>
			)}

			{addToCollectionModalOpen && (
				<AddDeckToCollectionModal
					zoneStats={zoneStats}
					availableZones={availableZones}
					onConfirm={(options) => {
						executeAddToCollection(options);
						setAddToCollectionModalOpen(false);
					}}
					onClose={() => setAddToCollectionModalOpen(false)}
				/>
			)}

			{pdfExportModalOpen && (
				<DeckPdfExportModal
					availableZones={pdfZones}
					cards={resolvedCards}
					onConfirm={(options) => {
						setPdfExportOptions(options);
						setPdfExportModalOpen(false);
						setPdfSettingsModalOpen(true);
					}}
					onClose={() => setPdfExportModalOpen(false)}
				/>
			)}

			{textExportModalOpen && (
				<DeckTextExportModal
					text={decklistText}
					deckName={deck.name}
					onClose={() => setTextExportModalOpen(false)}
				/>
			)}

			{importListOpen && (
				<ImportListIntoDeckModal
					deckId={deckId}
					existingOracleIds={existingOracleIds}
					onClose={() => setImportListOpen(false)}
				/>
			)}

			{pdfSettingsModalOpen && pdfExportOptions && (
				<PdfSettingsModal
					cards={pdfFilteredCards}
					generating={pdfGenerating}
					onConfirm={(settings) => {
						void (async () => {
							setPdfGenerating(true);
							try {
								// Resolve localized images (cache hit → instant; miss → fetched
								// via the shared Scryfall throttle, serialized and 429-safe).
								const resolved = await Promise.all(
									pdfFilteredCards.map((c) => resolveLocalizedImageUris(c, 'normal'))
								);
								const imageUrls = resolved.flat().filter((url): url is string => !!url);
								await generateCardsPdf(imageUrls, settings, `${deck.name}.pdf`);
								setPdfSettingsModalOpen(false);
							} finally {
								setPdfGenerating(false);
							}
						})();
					}}
					onClose={() => setPdfSettingsModalOpen(false)}
				/>
			)}

			{!searchPanelOpen && (
				<Button
					variant="primary"
					className={styles.addCardsBtn}
					onClick={() => setSearchPanelOpen(true)}
				>
					<PlusIcon weight="bold" />
					{t('cards')}
				</Button>
			)}

			<DeckFooter stats={stats} format={deck.format} warnings={warnings} />

			{pendingCollectionAdd && (
				<AddCardToCollectionModal
					cardName={pendingCollectionAdd.cardName}
					unownedRowIds={pendingCollectionAdd.unownedRowIds}
					onConfirm={({ rowIds, asProxy }) => {
						for (const rowId of rowIds) toggleOwned(rowId, asProxy);
						setPendingCollectionAdd(null);
					}}
					onClose={() => setPendingCollectionAdd(null)}
				/>
			)}

			{pendingRemove && (
				<RemoveDeckCardModal
					cardName={pendingRemove.cardName}
					membership={pendingRemove.membership}
					onConfirm={({ alsoRemove }) => {
						removeCardFromDeck(pendingRemove.rowId, alsoRemove ? 'delete' : 'detach');
						setPendingRemove(null);
					}}
					onClose={() => setPendingRemove(null)}
				/>
			)}

			<CardModal
				cards={panelSelectedCard}
				onClose={() => setPanelSelectedCard(null)}
				addLabel="Add to Deck"
				availableZones={zones}
				onAddToWishlist={(card, entry) => {
					addToWishlist(card, entry);
				}}
				onAddToCollection={(card, entry) => {
					const zone = getDeckZone(entry.tags);
					if (panelInCollectionOnly) {
						const copy = findFreeCollectionCopy(
							card.id,
							card.oracle_id ?? '',
							entries,
							panelScryfallIdToOracleId
						);
						if (copy) {
							addCollectionCardToDeck(deckId, copy.rowId, zone);
						} else {
							// No free collection copy available — don't add a ghost deck card
							setPanelSelectedCard(null);
							return;
						}
						setPanelSelectedCard(null);
						return;
					}
					addCardToDeck(deckId, card, zone);
					setPanelSelectedCard(null);
				}}
			/>
		</div>
	);
}
