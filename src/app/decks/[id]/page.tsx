'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { validateDeck } from '@/lib/deck/utils/format-rules';
import { Spinner } from '@/components/Spinner/Spinner';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardListColumn } from '@/lib/card/components/CardListTable/CardListTable.types';
import { Button } from '@/components/Button/Button';
import { useDeckDetail, type ResolvedDeckCard } from './useDeckDetail';
import { useDeckCardSections } from './useDeckCardSections';
import { DeckHeader } from './components/DeckHeader/DeckHeader';
import { DeckStats } from './components/DeckStats/DeckStats';
import { DeckCardOverlay } from './components/DeckCardOverlay/DeckCardOverlay';
import { DeckFooter } from './components/DeckFooter/DeckFooter';
import { AddCardModal } from './components/AddCardModal/AddCardModal';
import type { DeckZone } from '@/types/decks';
import styles from './page.module.css';

export default function DeckDetailPage() {
	const params = useParams();
	const deckId = params.id as string;

	const { updateDeck, addCardToDeck, removeCardFromDeck, changeZone, activeDeckCards } =
		useDeckContext();
	const { deck, cardsByZone, resolvedCards, stats, isLoading, isResolving } = useDeckDetail(deckId);

	const [showAddCard, setShowAddCard] = useState(false);

	const showCommander = deck?.format === 'commander' || deck?.format === 'brawl';

	const zones: DeckZone[] = useMemo(
		() =>
			showCommander
				? ['commander', 'mainboard', 'sideboard', 'maybeboard']
				: ['mainboard', 'sideboard', 'maybeboard'],
		[showCommander]
	);

	const { sections, groupByCardId } = useDeckCardSections(cardsByZone, showCommander);

	const tableColumns: CardListColumn[] = useMemo(
		() => [
			{
				key: 'qty',
				label: 'Qté',
				render: (card) => groupByCardId.get(card.id)?.count ?? 1,
			},
			{ key: 'name', label: 'Nom' },
			{ key: 'type_line', label: 'Type' },
			{
				key: 'mana_cost',
				label: 'Mana',
				render: (card) => ('mana_cost' in card ? (card.mana_cost as string) : '—'),
			},
			{
				key: 'set',
				label: 'Set',
				render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
			},
		],
		[groupByCardId]
	);

	const warnings = useMemo(() => {
		if (!deck) return [];
		const allCards = resolvedCards.filter((rc) => rc.zone !== 'commander');
		const commanderCards = resolvedCards.filter((rc) => rc.zone === 'commander');
		return validateDeck(
			deck.format,
			allCards.map((rc) => ({ card: rc.card, zone: rc.zone })),
			commanderCards.map((rc) => ({ card: rc.card, zone: rc.zone }))
		);
	}, [deck, resolvedCards]);

	const getQuantityInDeck = useCallback(
		(scryfallId: string) => {
			return Object.values(activeDeckCards).filter((c) => c.scryfallId === scryfallId).length;
		},
		[activeDeckCards]
	);

	const handleDuplicateCard = useCallback(
		(rc: ResolvedDeckCard) => {
			addCardToDeck(deckId, rc.card, rc.zone);
		},
		[deckId, addCardToDeck]
	);

	const renderOverlay = useCallback(
		(card: AnyCard) => {
			const group = groupByCardId.get(card.id);
			if (!group) return null;
			return (
				<DeckCardOverlay
					group={group}
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
			<div className={styles.content}>
				<DeckHeader deck={deck} onUpdate={(updates) => updateDeck(deckId, updates)} />

				{isResolving && Object.keys(activeDeckCards).length > 0 && (
					<div className={styles.resolving}>
						<Spinner /> Loading card data...
					</div>
				)}

				<div className={styles.toolbar}>
					<Button size="sm" onClick={() => setShowAddCard(true)}>
						+ Add Card
					</Button>
				</div>

				<CardList
					cards={sections}
					renderOverlay={renderOverlay}
					tableColumns={tableColumns}
					pageSize={false}
				/>

				<DeckStats stats={stats} warnings={warnings} />
			</div>

			<DeckFooter stats={stats} format={deck.format} warnings={warnings} />

			{showAddCard && (
				<AddCardModal
					activeZone="mainboard"
					onAdd={(card, zone) => addCardToDeck(deckId, card, zone)}
					onClose={() => setShowAddCard(false)}
					getQuantityInDeck={getQuantityInDeck}
				/>
			)}
		</div>
	);
}
