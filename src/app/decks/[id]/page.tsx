'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
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

	const { updateDeck, addCardToDeck, removeCardFromDeck, changeZone, activeDeckCards } =
		useDeckContext();
	const { deck, cardsByZone, resolvedCards, stats, isLoading, isResolving } = useDeckDetail(deckId);

	const [searchPanelOpen, setSearchPanelOpen] = useState(false);
	const [panelSelectedCard, setPanelSelectedCard] = useState<ScryfallCard | null>(null);

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
		handleCardGroupClick,
		handleClose,
		handleSave,
		handleRemoveEntry,
		handleAddCopy,
		handleChangeZone,
		handleChangePrint,
		handleAssignCollectionCopy,
	} = useDeckCardModal(deckId, groupByCardId);

	const { entries } = useCollectionContext();

	// scryfallIds of all prints in the currently selected card group
	const selectedScryfallIds = useMemo(
		() => new Set(selectedCards?.map((c) => c.id) ?? []),
		[selectedCards]
	);

	// Free collection copies filtered to the selected card's prints only
	const freeCollectionCopies = useMemo(
		() =>
			entries
				.filter((e) => !e.entry.deckId && selectedScryfallIds.has(e.scryfallId))
				.map((e) => ({
					rowId: e.entry.rowId,
					scryfallId: e.scryfallId,
					condition: e.entry.condition,
					isFoil: e.entry.isFoil,
					language: e.entry.language,
				})),
		[entries, selectedScryfallIds]
	);

	const handleCardClick = useCallback(
		(card: AnyCard) => {
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id);
			if (group) handleCardGroupClick(group, c.entry.rowId);
		},
		[groupByCardId, handleCardGroupClick]
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

	const renderOverlay = useCallback(
		(card: AnyCard) => {
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id);
			const currentZone = getDeckZone(c.entry.tags);
			if (!group) return null;
			return (
				<DeckCardOverlay
					group={group}
					currentZone={currentZone}
					zones={zones}
					onDuplicate={handleDuplicateCard}
					onRemove={removeCardFromDeck}
					onChangeZone={changeZone}
				/>
			);
		},
		[groupByCardId, zones, handleDuplicateCard, removeCardFromDeck, changeZone]
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
				</div>

				{searchPanelOpen && (
					<CardSearchPanel
						deckId={deckId}
						onCardClick={setPanelSelectedCard}
						onClose={() => setSearchPanelOpen(false)}
						deckFormat={deck.format}
						commanderColorIdentity={commanderColorIdentity}
					/>
				)}
			</div>

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
				zone={selectedZone ?? undefined}
				availableZones={zones}
				onClose={handleClose}
				onSave={handleSave}
				onRemoveEntry={handleRemoveEntry}
				onIncrement={handleAddCopy}
				onChangeZone={handleChangeZone}
				onChangePrint={handleChangePrint}
				collectionCopies={freeCollectionCopies}
				onAssignCollectionCopy={handleAssignCollectionCopy}
			/>

			<CardModal
				cards={panelSelectedCard}
				onClose={() => setPanelSelectedCard(null)}
				addLabel="Add to Deck"
				availableZones={zones}
				onAddToCollection={(card, entry) => {
					const zone =
						(entry.tags
							?.find((t: string) => t.startsWith('deck:'))
							?.replace('deck:', '') as DeckZone) ?? 'mainboard';
					addCardToDeck(deckId, card, zone);
					setPanelSelectedCard(null);
				}}
			/>
		</div>
	);
}
