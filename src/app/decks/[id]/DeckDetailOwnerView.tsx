'use client';

import { useState, useCallback, useMemo } from 'react';
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
import { useDeckCardModal } from '@/lib/card/hooks/useDeckCardModal';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { findFreeCollectionCopy } from '@/lib/deck/utils/collectionCopyResolver';
import { useDeckDetail, type ResolvedDeckCard } from './useDeckDetail';
import { useDeckCardSections, dedupeByOracle } from './useDeckCardSections';
import { DeckHeader } from './components/DeckHeader/DeckHeader';
import { DeckStats } from './components/DeckStats/DeckStats';
import { DeckCardOverlay } from './components/DeckCardOverlay/DeckCardOverlay';
import { withCustomBadge } from '@/lib/card/utils/composeOverlay';
import { DeckFooter } from './components/DeckFooter/DeckFooter';
import { CardSearchPanel } from './components/CardSearchPanel/CardSearchPanel';
import { WishlistIcon } from '@/lib/wishlist/components/WishlistIcon';
import { Button } from '@/components/Button/Button';
import { PlusIcon } from '@phosphor-icons/react';
import { useAddDeckToCollection } from './useAddDeckToCollection';
import { AddDeckToCollectionModal } from './components/AddDeckToCollectionModal/AddDeckToCollectionModal';
import { AddCardToCollectionModal } from './components/AddCardToCollectionModal/AddCardToCollectionModal';
import {
	RemoveDeckCardModal,
	type RemoveDeckCardMembership,
} from './components/RemoveDeckCardModal/RemoveDeckCardModal';
import { buildCollectionAddRequest, type CollectionAddRequest } from './collectionAddRequest';
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import { getCopyBadgeState } from '@/lib/card/components/OwnershipBadge/copyBadgeState';
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
import { cardProducesToken } from '@/lib/deck/utils/collectDeckTokens';
import { DeckSortBar } from './components/DeckSortBar/DeckSortBar';
import { DeckTokens } from './components/DeckTokens/DeckTokens';
import type { DeckGroupBy } from './useDeckCardSections';
import styles from './page.module.css';

function resolveAssignedDeckName(
	deckId: string | undefined,
	assignedToCurrentDeck: boolean,
	currentDeckName: string | undefined,
	deckNameById: Map<string, string>
): string | undefined {
	if (deckId == null) return undefined;
	return assignedToCurrentDeck ? currentDeckName : deckNameById.get(deckId);
}

export default function DeckDetailOwnerView({ deckId }: { deckId: string }) {
	const {
		decks: allDecks,
		updateDeck,
		addCardToDeck,
		addCollectionCardToDeck,
		removeCardFromDeck,
		changeZone,
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

	const [bulkSelectMode, setBulkSelectMode] = useState(false);
	const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
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

	const {
		selectedCards,
		selectedZone,
		clickedRowId,
		handleCardGroupClick,
		handleClose,
		handleSave,
		handleAddCopy,
		handleChangeZone,
		handleChangePrint,
		handleAssignCollectionCopy,
		handleUnassignCollectionCopy,
	} = useDeckCardModal(deckId, groupByCardId);

	const { entries } = useCollectionContext();
	const { addToWishlist, removeFromWishlist, entries: wishlistEntries } = useWishlistContext();

	// scryfallIds of all prints in the currently selected card group
	const selectedScryfallIds = useMemo(
		() => new Set(selectedCards?.map((c) => c.id) ?? []),
		[selectedCards]
	);

	// When the open modal shows a token, list the deck cards that generate it,
	// split into sections by zone.
	const tokenProducerSections = useMemo((): CardListSection[] | undefined => {
		const selected = selectedCards?.[0];
		if (!selected || getDeckZone(selected.entry.tags) !== 'tokens') return undefined;

		const PRODUCER_ZONES: { zone: DeckZone; label: string }[] = [
			{ zone: 'commander', label: 'Commander' },
			{ zone: 'mainboard', label: 'Mainboard' },
			{ zone: 'sideboard', label: 'Sideboard' },
			{ zone: 'maybeboard', label: 'Maybeboard' },
		];

		const sections: CardListSection[] = [];
		for (const { zone, label } of PRODUCER_ZONES) {
			const seen = new Set<string>();
			const cards: AnyCard[] = [];
			for (const card of cardsByZone[zone]) {
				if (!cardProducesToken(card as ScryfallCard, selected)) continue;
				const key = card.oracle_id ?? card.id;
				if (seen.has(key)) continue;
				seen.add(key);
				cards.push(card);
			}
			if (cards.length > 0) sections.push({ label: `${label} (${cards.length})`, cards });
		}
		return sections.length > 0 ? sections : undefined;
	}, [selectedCards, cardsByZone]);

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

	// All collection copies (assigned + free) for the selected card.
	// Matched by oracle_id (all editions), like the ownership badge — not just the
	// exact prints present in the deck — so copies of a different edition are offered too.
	const allCollectionCopies = useMemo(() => {
		const selected = selectedCards?.[0];
		const oracleId = selected ? collectionScryfallIdToOracleId.get(selected.id) : undefined;
		const matchingScryfallIds = oracleId
			? (oracleIdToAllScryfallIds.get(oracleId) ?? selectedScryfallIds)
			: selectedScryfallIds;
		return entries
			.filter((e) => matchingScryfallIds.has(e.scryfallId))
			.map((e) => {
				const assignedToCurrentDeck = !!e.entry.deckId && e.entry.deckId === deck?.id;
				return {
					rowId: e.entry.rowId,
					scryfallId: e.scryfallId,
					condition: e.entry.condition,
					isFoil: e.entry.isFoil,
					foilType: e.entry.foilType,
					proxy: e.entry.proxy,
					language: e.entry.language,
					assignedToDeckName: resolveAssignedDeckName(
						e.entry.deckId,
						assignedToCurrentDeck,
						deck?.name,
						deckNameById
					),
					isCurrentDeck: assignedToCurrentDeck,
				};
			});
	}, [
		entries,
		selectedCards,
		selectedScryfallIds,
		collectionScryfallIdToOracleId,
		oracleIdToAllScryfallIds,
		deck,
		deckNameById,
	]);

	const wishlistScryfallIds = useMemo(
		() => new Set(wishlistEntries.map((e) => e.scryfallId)),
		[wishlistEntries]
	);

	const panelScryfallIdToOracleId = collectionScryfallIdToOracleId;

	const toggleBulkSelect = useCallback((oracleId: string) => {
		setBulkSelected((prev) => {
			const next = new Set(prev);
			if (next.has(oracleId)) next.delete(oracleId);
			else next.add(oracleId);
			return next;
		});
	}, []);

	const handleCardClick = useCallback(
		(card: AnyCard) => {
			if (bulkSelectMode) {
				const c = card as ResolvedDeckCard;
				toggleBulkSelect(c.oracle_id ?? c.id);
				return;
			}
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id ?? c.id);
			if (group) handleCardGroupClick(group, c.entry.rowId);
		},
		[bulkSelectMode, toggleBulkSelect, groupByCardId, handleCardGroupClick]
	);

	const tableColumns: CardListColumn[] = useMemo(
		() => [
			{
				key: 'qty',
				label: 'Qté',
				render: (card) => {
					const c = card as ResolvedDeckCard;
					const zone = getDeckZone(c.entry.tags);
					return groupByCardId.get(c.oracle_id ?? c.id)?.byZone.get(zone)?.length ?? 1;
				},
			},
			{ key: 'name', label: 'Nom' },
			{ key: 'type_line', label: 'Type' },
			{
				key: 'mana_cost',
				label: 'Mana',
				render: (card) => {
					const cost = 'mana_cost' in card ? (card.mana_cost as string) : '';
					if (!cost) return '—';
					return <SymbolText text={cost} symbolMap={symbolMap} />;
				},
			},
			{
				key: 'set',
				label: 'Set',
				render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
			},
		],
		[groupByCardId, symbolMap]
	);

	// Tokens have no deck quantity or relevant mana cost; show identity-focused
	// columns instead of reusing the main deck columns.
	const tokenTableColumns: CardListColumn[] = useMemo(
		() => [
			{ key: 'name', label: 'Nom' },
			{ key: 'type_line', label: 'Type' },
			{
				key: 'pt',
				label: 'P/F',
				render: (card) => {
					const power = 'power' in card ? (card.power as string | undefined) : undefined;
					const toughness =
						'toughness' in card ? (card.toughness as string | undefined) : undefined;
					return power != null && toughness != null ? `${power}/${toughness}` : '—';
				},
			},
		],
		[]
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

	const handleBulkAddToWishlist = useCallback(() => {
		for (const oracleId of bulkSelected) {
			const group = groupByCardId.get(oracleId);
			if (!group) continue;
			// Flag the wishlist on an actual deck-card row (first copy), in place —
			// same behaviour as the single "Add to Wishlist". Skip copies already
			// wishlisted so bulk add never toggles one off.
			const firstCopy = Array.from(group.byZone.values()).flat()[0];
			if (!firstCopy || firstCopy.entry.wishlist) continue;
			toggleDeckCardWishlist(firstCopy.entry.rowId);
		}
		setBulkSelected(new Set());
		setBulkSelectMode(false);
	}, [bulkSelected, groupByCardId, toggleDeckCardWishlist]);

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
		wishlistMatchCount,
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

			if (bulkSelectMode) {
				const checked = bulkSelected.has(c.oracle_id ?? c.id);
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
					onBadgeClick={() => handleCardGroupClick(group, firstCopy?.entry.rowId ?? c.entry.rowId)}
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
			bulkSelectMode,
			bulkSelected,
			zones,
			deckId,
			deckNameResolver,
			oracleIdToAllScryfallIds,
			handleDuplicateCard,
			handleRemoveRequest,
			changeZone,
			handleCardGroupClick,
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
					<h2>Deck not found</h2>
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
						cards={sections}
						renderOverlay={renderOverlay}
						onCardClick={handleCardClick}
						onCardContextMenu={bulkSelectMode ? undefined : handleCardContextMenu}
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

					<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
						<button
							type="button"
							className={`${styles.bulkSelectToggle} ${bulkSelectMode ? styles.bulkSelectToggleActive : ''}`}
							onClick={() => {
								setBulkSelectMode((v) => !v);
								setBulkSelected(new Set());
							}}
						>
							{bulkSelectMode ? 'Cancel select' : 'Select cards'}
						</button>
					</div>
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

			{bulkSelectMode && bulkSelected.size > 0 && (
				<div className={styles.bulkBar}>
					<span className={styles.bulkBarCount}>{bulkSelected.size} selected</span>
					<button
						type="button"
						className="btn btn-primary"
						style={{
							padding: '6px 14px',
							fontSize: 'var(--text-sm)',
							borderRadius: '4px',
							cursor: 'pointer',
							background: 'var(--primary)',
							color: 'var(--primary-text)',
							border: 'none',
							display: 'flex',
							alignItems: 'center',
							gap: '6px',
						}}
						onClick={handleBulkAddToWishlist}
					>
						<WishlistIcon size={13} /> Add to Wishlist
					</button>
					<button
						type="button"
						className={styles.bulkBarCancel}
						onClick={() => setBulkSelected(new Set())}
					>
						Clear
					</button>
				</div>
			)}

			{addToCollectionModalOpen && (
				<AddDeckToCollectionModal
					zoneStats={zoneStats}
					availableZones={availableZones}
					wishlistMatchCount={wishlistMatchCount}
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
					Cards
				</Button>
			)}

			<DeckFooter stats={stats} format={deck.format} warnings={warnings} />

			<CardModal
				cards={selectedCards}
				initialRowId={clickedRowId ?? undefined}
				zone={selectedZone ?? undefined}
				availableZones={zones}
				onClose={handleClose}
				onSave={handleSave}
				onRemoveEntry={(rowId) => {
					handleRemoveRequest(rowId);
					handleClose();
				}}
				onIncrement={handleAddCopy}
				onChangeZone={handleChangeZone}
				onChangePrint={handleChangePrint}
				collectionCopies={allCollectionCopies}
				onAssignCollectionCopy={handleAssignCollectionCopy}
				onUnassignCollectionCopy={handleUnassignCollectionCopy}
				onAddToCollectionFromEntry={(rowIds) => {
					const card = selectedCards?.[0];
					if (!card || rowIds.length === 0) return;
					const oracleScryfallIds = Array.from(
						oracleIdToAllScryfallIds.get(card.oracle_id ?? card.id) ?? new Set<string>([card.id])
					);
					const copies = rowIds
						.map((id) => selectedCards?.find((c) => c.entry.rowId === id))
						.filter((c): c is NonNullable<typeof c> => c != null);
					const req = buildCollectionAddRequest(
						card.name,
						copies,
						oracleScryfallIds,
						wishlistEntries
					);
					if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
				}}
				onRemoveFromCollectionEntry={(rowId) => toggleOwned(rowId)}
				onAddToWishlistFromEntry={(deckCardRowId) => {
					toggleDeckCardWishlist(deckCardRowId);
				}}
				producerSections={tokenProducerSections}
				onProducerClick={handleCardClick}
				renderCopyBadge={(copy) => {
					const state = getCopyBadgeState(copy, wishlistScryfallIds);
					return (
						<OwnershipBadge
							badgeState={state}
							onClick={
								state === 'none'
									? () => {
											const card = selectedCards?.[0];
											if (!card) return;
											const oracleScryfallIds = Array.from(
												oracleIdToAllScryfallIds.get(card.oracle_id ?? card.id) ??
													new Set<string>([card.id])
											);
											const req = buildCollectionAddRequest(
												card.name,
												[copy],
												oracleScryfallIds,
												wishlistEntries
											);
											if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
										}
									: undefined
							}
						/>
					);
				}}
			/>

			{pendingCollectionAdd && (
				<AddCardToCollectionModal
					cardName={pendingCollectionAdd.cardName}
					unownedRowIds={pendingCollectionAdd.unownedRowIds}
					wishlistMatchCount={pendingCollectionAdd.wishlistRowIds.length}
					onConfirm={({ rowIds, asProxy, removeWishlist }) => {
						for (const rowId of rowIds) toggleOwned(rowId, asProxy);
						if (removeWishlist) {
							for (const rowId of pendingCollectionAdd.wishlistRowIds) {
								removeFromWishlist(rowId);
							}
						}
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
