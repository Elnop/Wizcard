'use client';

import { useState, useCallback, useMemo, type MouseEvent } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { validateDeck } from '@/lib/deck/utils/format-rules';
import { Spinner } from '@/components/Spinner/Spinner';
import { Button } from '@/components/Button/Button';
import { CardList } from '@/lib/card/components/CardList/CardList';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { getDeckZone } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { ContextMenu } from '@/components/ContextMenu/ContextMenu';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { serializeDecklist } from '@/lib/deck/utils/serialize-decklist';
import { usePublicDeckDetail } from './usePublicDeckDetail';
import type { ResolvedDeckCard } from './useDeckDetail';
import { useDeckCardSections, dedupeByOracle, type DeckGroupBy } from './useDeckCardSections';
import { useDeckSort } from './useDeckSort';
import { useCopyDeckToMyCollection } from './useCopyDeckToMyCollection';
import { DeckHeader } from './components/DeckHeader/DeckHeader';
import { DeckStats } from './components/DeckStats/DeckStats';
import { SampleHand } from './components/SampleHand/SampleHand';
import { DeckFooter } from './components/DeckFooter/DeckFooter';
import { DeckSortBar } from './components/DeckSortBar/DeckSortBar';
import { DeckTextExportModal } from './components/DeckTextExportModal/DeckTextExportModal';
import styles from './page.module.css';

/**
 * Public, read-only deck view (anonymous or non-owner visitors). Reuses the
 * display components from the owner view but mounts none of the editing
 * affordances (search panel, edit modals, overlays). A logged-in visitor also
 * gets a "copy this deck into my account" action.
 */
export function DeckDetailReadOnlyView({ deckId }: { deckId: string }) {
	const { user } = useAuth();
	const {
		deck,
		cardsByZone,
		resolvedCards,
		stats,
		coverArtUrl,
		isLoading,
		isResolving,
		deckCardCount,
	} = usePublicDeckDetail(deckId);
	const { addCards } = useCollectionContext();
	const { openAddCard } = useAddCardModal();

	const [selectedCards, setSelectedCards] = useState<ResolvedDeckCard[] | null>(null);
	const [textExportModalOpen, setTextExportModalOpen] = useState(false);

	const cardMenu = useContextMenu<ResolvedDeckCard>();

	const { order, dir, setOrder, setDir, sortCards } = useDeckSort();
	const [groupBy, setGroupBy] = useState<DeckGroupBy>('type');

	const showCommander = deck?.format === 'commander' || deck?.format === 'brawl';

	const { sections, groupByCardId } = useDeckCardSections(
		cardsByZone,
		showCommander,
		sortCards,
		groupBy
	);

	const decklistText = useMemo(() => serializeDecklist(cardsByZone), [cardsByZone]);

	const zones: DeckZone[] = useMemo(
		() =>
			showCommander
				? ['commander', 'mainboard', 'sideboard', 'maybeboard']
				: ['mainboard', 'sideboard', 'maybeboard'],
		[showCommander]
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

	const { copyDeck, isCopying } = useCopyDeckToMyCollection();

	const handleCardClick = useCallback(
		(card: AnyCard) => {
			const c = card as ResolvedDeckCard;
			const group = groupByCardId.get(c.oracle_id ?? c.id);
			if (group) {
				setSelectedCards(Array.from(group.byZone.values()).flat());
			}
		},
		[groupByCardId]
	);

	const handleCardContextMenu = useCallback(
		(card: AnyCard, e: MouseEvent) => {
			cardMenu.open(card as ResolvedDeckCard, e);
		},
		[cardMenu]
	);

	// One card per logical token — the overlay shows the per-stack count, so
	// duplicate copies must not render as separate stacks.
	const tokenSections = useMemo(() => {
		const tokens = dedupeByOracle(cardsByZone.tokens);
		return tokens.length > 0 ? [{ label: 'Tokens', cards: tokens }] : [];
	}, [cardsByZone.tokens]);

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
			<div className={styles.layout}>
				<div className={styles.content}>
					<DeckHeader deck={deck} readOnly onExportText={() => setTextExportModalOpen(true)} />

					{user && (
						<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
							<Button
								onClick={() => void copyDeck(deck, resolvedCards)}
								disabled={isCopying || isResolving}
							>
								{isCopying ? 'Copying…' : 'Copy to my decks'}
							</Button>
						</div>
					)}

					<DeckSortBar
						order={order}
						dir={dir}
						onOrderChange={setOrder}
						onDirChange={setDir}
						groupBy={groupBy}
						onGroupByChange={setGroupBy}
					/>

					{isResolving && (
						<div className={styles.resolving}>
							<Spinner /> Loading card data...
						</div>
					)}

					<CardList
						cards={sections}
						isLoading={isResolving && resolvedCards.length === 0}
						skeletonCount={deckCardCount || undefined}
						onCardClick={handleCardClick}
						onCardContextMenu={user ? handleCardContextMenu : undefined}
						pageSize={false}
						viewModes={['fluid-grid', 'grid', 'table']}
						cardGap="compact"
						showCardNames={false}
					/>

					{tokenSections.length > 0 && (
						<CardList
							cards={tokenSections}
							onCardClick={handleCardClick}
							onCardContextMenu={user ? handleCardContextMenu : undefined}
							pageSize={false}
							viewModes={['fluid-grid', 'grid']}
							cardGap="compact"
							showCardNames={false}
						/>
					)}

					<DeckStats stats={stats} warnings={warnings} />
					<SampleHand mainboard={cardsByZone.mainboard} />
				</div>
			</div>

			{textExportModalOpen && (
				<DeckTextExportModal
					text={decklistText}
					deckName={deck.name}
					onClose={() => setTextExportModalOpen(false)}
				/>
			)}

			<DeckFooter stats={stats} format={deck.format} warnings={warnings} />

			<CardModal
				cards={selectedCards}
				availableZones={zones}
				onClose={() => setSelectedCards(null)}
			/>

			{cardMenu.menu && (
				<ContextMenu
					items={[
						{
							type: 'action',
							label: 'Add to Collection',
							icon: '+',
							onClick: () => {
								openAddCard({
									scryfallCard: cardMenu.menu!.data as ScryfallCard,
									onAdd: (selectedCard, entry, count) => addCards(selectedCard, count, entry),
								});
								cardMenu.close();
							},
						},
					]}
					position={cardMenu.menu.position}
					onClose={cardMenu.close}
				/>
			)}
		</div>
	);
}
