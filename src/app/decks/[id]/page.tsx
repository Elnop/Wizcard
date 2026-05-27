'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { validateDeck } from '@/lib/deck/utils/format-rules';
import { Spinner } from '@/components/Spinner/Spinner';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { getDeckZone } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { SymbolText } from '@/lib/scryfall/components/SymbolText';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { useDeckCardModal } from '@/lib/card/hooks/useDeckCardModal';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import { findFreeCollectionCopy } from '@/lib/deck/utils/collectionCopyResolver';
import { useDeckDetail, type ResolvedDeckCard } from './useDeckDetail';
import { useDeckCardSections } from './useDeckCardSections';
import { DeckHeader } from './components/DeckHeader/DeckHeader';
import { DeckStats } from './components/DeckStats/DeckStats';
import { DeckCardOverlay } from './components/DeckCardOverlay/DeckCardOverlay';
import { DeckFooter } from './components/DeckFooter/DeckFooter';
import { CardSearchPanel } from './components/CardSearchPanel/CardSearchPanel';
import styles from './page.module.css';

export default function DeckDetailPage() {
	const params = useParams();
	const deckId = params.id as string;

	const {
		decks: allDecks,
		updateDeck,
		addCardToDeck,
		addCollectionCardToDeck,
		removeCardFromDeck,
		changeZone,
		activeDeckCards,
	} = useDeckContext();
	const { deck, cardsByZone, resolvedCards, stats, isLoading, isResolving } = useDeckDetail(deckId);

	const [searchPanelOpen, setSearchPanelOpen] = useState(false);
	const [panelSelectedCard, setPanelSelectedCard] = useState<ScryfallCard | null>(null);
	const [panelInCollectionOnly, setPanelInCollectionOnly] = useState(false);

	const [bulkSelectMode, setBulkSelectMode] = useState(false);
	const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

	const showCommander = deck?.format === 'commander' || deck?.format === 'brawl';

	const zones: DeckZone[] = useMemo(
		() =>
			showCommander
				? ['commander', 'mainboard', 'sideboard', 'maybeboard']
				: ['mainboard', 'sideboard', 'maybeboard'],
		[showCommander]
	);

	const { sections, groupByCardId } = useDeckCardSections(cardsByZone, showCommander);
	const symbolMap = useScryfallSymbols();

	const {
		selectedCards,
		selectedZone,
		clickedRowId,
		openPrintPicker,
		handleCardGroupClick,
		handleCardGroupClickWithPrintPicker,
		handleClose,
		handleSave,
		handleRemoveEntry,
		handleAddCopy,
		handleChangeZone,
		handleChangePrint,
		handleAssignCollectionCopy,
	} = useDeckCardModal(deckId, groupByCardId);

	const { entries } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();

	// scryfallIds of all prints in the currently selected card group
	const selectedScryfallIds = useMemo(
		() => new Set(selectedCards?.map((c) => c.id) ?? []),
		[selectedCards]
	);

	const deckNameById = useMemo(() => new Map(allDecks.map((d) => [d.id, d.name])), [allDecks]);

	const deckNameResolver = useCallback((id: string) => deckNameById.get(id), [deckNameById]);

	// All collection copies (assigned + free) filtered to the selected card's prints only
	const allCollectionCopies = useMemo(
		() =>
			entries
				.filter((e) => selectedScryfallIds.has(e.scryfallId))
				.map((e) => {
					const assignedToCurrentDeck = !!e.entry.deckId && e.entry.deckId === deck?.id;
					return {
						rowId: e.entry.rowId,
						scryfallId: e.scryfallId,
						condition: e.entry.condition,
						isFoil: e.entry.isFoil,
						language: e.entry.language,
						assignedToDeckName:
							e.entry.deckId != null
								? assignedToCurrentDeck
									? deck?.name
									: deckNameById.get(e.entry.deckId)
								: undefined,
						isCurrentDeck: assignedToCurrentDeck,
					};
				}),
		[entries, selectedScryfallIds, deck, deckNameById]
	);

	const emptyEntries = useMemo(() => [], []);

	const { stacks: panelCollectionStacks } = useCollectionCards(
		panelInCollectionOnly ? entries : emptyEntries
	);

	const panelScryfallIdToOracleId = useMemo(() => {
		const map = new Map<string, string>();
		for (const stack of panelCollectionStacks) {
			for (const card of stack.cards) {
				if (card.oracle_id) map.set(card.id, card.oracle_id);
			}
		}
		return map;
	}, [panelCollectionStacks]);

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
				toggleBulkSelect(c.oracle_id);
				return;
			}
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id);
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
					return groupByCardId.get(c.oracle_id)?.byZone.get(zone)?.length ?? 1;
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

	const warnings = useMemo(() => {
		if (!deck) return [];
		const allCards = resolvedCards.filter((rc) => getDeckZone(rc.entry.tags) !== 'commander');
		const commanderCards = resolvedCards.filter((rc) => getDeckZone(rc.entry.tags) === 'commander');
		return validateDeck(
			deck.format,
			allCards.map((rc) => ({ card: rc, zone: getDeckZone(rc.entry.tags) })),
			commanderCards.map((rc) => ({ card: rc, zone: getDeckZone(rc.entry.tags) }))
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

	const handleDuplicateCard = useCallback(
		(rc: ResolvedDeckCard) => {
			addCardToDeck(deckId, rc, getDeckZone(rc.entry.tags));
		},
		[deckId, addCardToDeck]
	);

	const handleBulkAddToWishlist = useCallback(() => {
		for (const oracleId of bulkSelected) {
			const group = groupByCardId.get(oracleId);
			if (!group) continue;
			const representativeCard = group.representative as ResolvedDeckCard;
			addToWishlist({ id: representativeCard.id } as ScryfallCard);
		}
		setBulkSelected(new Set());
		setBulkSelectMode(false);
	}, [bulkSelected, groupByCardId, addToWishlist]);

	const renderOverlay = useCallback(
		(card: AnyCard) => {
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id);
			const currentZone = getDeckZone(c.entry.tags);
			if (!group) return null;

			if (bulkSelectMode) {
				const checked = bulkSelected.has(c.oracle_id);
				return (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'flex-start',
							justifyContent: 'flex-start',
							padding: '8px',
							background: checked ? 'rgba(124,106,245,0.18)' : 'transparent',
							border: checked ? '2px solid rgba(124,106,245,0.7)' : '2px solid transparent',
							borderRadius: '4px',
							boxSizing: 'border-box',
						}}
						onClick={(e) => {
							e.stopPropagation();
							toggleBulkSelect(c.oracle_id);
						}}
					>
						<input
							type="checkbox"
							checked={checked}
							onChange={() => toggleBulkSelect(c.oracle_id)}
							onClick={(e) => e.stopPropagation()}
							style={{ width: 18, height: 18, cursor: 'pointer' }}
						/>
					</div>
				);
			}

			const oracleScryfallIds = Array.from(
				new Set(
					Array.from(group.byZone.values())
						.flat()
						.map((rc) => rc.id)
				)
			);

			const firstCopy = group.byZone.get(currentZone)?.[0];
			return (
				<DeckCardOverlay
					group={group}
					currentZone={currentZone}
					zones={zones}
					deckId={deckId}
					oracleScryfallIds={oracleScryfallIds}
					deckNameResolver={deckNameResolver}
					onDuplicate={handleDuplicateCard}
					onRemove={removeCardFromDeck}
					onChangeZone={changeZone}
					onBadgeClick={() =>
						handleCardGroupClickWithPrintPicker(group, firstCopy?.entry.rowId ?? c.entry.rowId)
					}
					onAddToWishlist={(scryfallId) => {
						addToWishlist({ id: scryfallId } as ScryfallCard);
					}}
				/>
			);
		},
		[
			groupByCardId,
			bulkSelectMode,
			bulkSelected,
			toggleBulkSelect,
			zones,
			deckId,
			deckNameResolver,
			handleDuplicateCard,
			removeCardFromDeck,
			changeZone,
			handleCardGroupClickWithPrintPicker,
			addToWishlist,
		]
	);

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
		<div className={styles.page}>
			<div className={`${styles.layout} ${searchPanelOpen ? styles.layoutWithPanel : ''}`}>
				<div className={styles.content}>
					<DeckHeader deck={deck} onUpdate={(updates) => updateDeck(deckId, updates)} />

					{isResolving && Object.keys(activeDeckCards).length > 0 && (
						<div className={styles.resolving}>
							<Spinner /> Loading card data...
						</div>
					)}

					<CardList
						cards={sections}
						renderOverlay={renderOverlay}
						onCardClick={handleCardClick}
						tableColumns={tableColumns}
						pageSize={false}
						viewModes={['fluid-grid', 'grid', 'table']}
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
						onClose={() => setSearchPanelOpen(false)}
						deckFormat={deck.format}
						commanderColorIdentity={commanderColorIdentity}
						onCollectionModeChange={setPanelInCollectionOnly}
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
						}}
						onClick={handleBulkAddToWishlist}
					>
						Add to Wishlist
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

			<DeckFooter
				stats={stats}
				format={deck.format}
				warnings={warnings}
				searchPanelOpen={searchPanelOpen}
				onToggleSearchPanel={() => setSearchPanelOpen((v) => !v)}
			/>

			<CardModal
				cards={selectedCards}
				initialRowId={clickedRowId ?? undefined}
				initialChangingPrintRowId={openPrintPicker ? (clickedRowId ?? undefined) : undefined}
				zone={selectedZone ?? undefined}
				availableZones={zones}
				onClose={handleClose}
				onSave={handleSave}
				onRemoveEntry={handleRemoveEntry}
				onIncrement={handleAddCopy}
				onChangeZone={handleChangeZone}
				onChangePrint={handleChangePrint}
				collectionCopies={allCollectionCopies}
				onAssignCollectionCopy={handleAssignCollectionCopy}
				onAddToWishlistFromEntry={(scryfallId) => {
					addToWishlist({ id: scryfallId } as ScryfallCard);
				}}
			/>

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
