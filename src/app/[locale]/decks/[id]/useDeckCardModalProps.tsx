'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { CollectionCopyEntry } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { cardProducesToken } from '@/lib/deck/utils/collectDeckTokens';
import { getCopyBadgeState } from '@/lib/card/components/OwnershipBadge/copyBadgeState';
import { OwnershipBadge } from '@/lib/card/components/OwnershipBadge/OwnershipBadge';
import { useDeckDetail } from './useDeckDetail';
import { useDeckCardSections } from './useDeckCardSections';
import { buildCollectionAddRequest, type CollectionAddRequest } from './collectionAddRequest';
import type { RemoveDeckCardMembership } from './components/RemoveDeckCardModal/RemoveDeckCardModal';

export type PendingRemove = {
	rowId: string;
	cardName: string;
	membership: RemoveDeckCardMembership;
};

/** The props this hook feeds into `<CardModal>` for the deck-owner case. */
export type DeckCardModalProps = {
	cards: Card[] | null;
	initialRowId?: string;
	zone?: DeckZone;
	availableZones: DeckZone[];
	onSave: (rowId: string, updates: Partial<CardEntry>) => void;
	onRemoveEntry: (rowId: string) => void;
	onIncrement: () => void;
	onChangeZone: (rowId: string, zone: DeckZone) => void;
	onChangePrint: (rowId: string, newCard: ScryfallCard) => void;
	collectionCopies: CollectionCopyEntry[];
	onAssignCollectionCopy: (rowId: string) => void;
	onUnassignCollectionCopy: () => void;
	onAddToCollectionFromEntry: (rowIds: string[]) => void;
	onRemoveFromCollectionEntry: (rowId: string) => void;
	onAddToWishlistFromEntry: (deckCardRowId: string) => void;
	producerSections?: CardListSection[];
	onProducerClick: (oracleKey: string, clickedRowId: string) => void;
	renderCopyBadge: (copy: Card) => React.ReactNode;
};

function resolveAssignedDeckName(
	deckId: string | undefined,
	assignedToCurrentDeck: boolean,
	currentDeckName: string | undefined,
	deckNameById: Map<string, string>
): string | undefined {
	if (deckId == null) return undefined;
	return assignedToCurrentDeck ? currentDeckName : deckNameById.get(deckId);
}

/**
 * Builds every prop the deck-owner `<CardModal>` needs, plus the two satellite
 * sub-flow states (`pendingCollectionAdd`, `pendingRemove`). Mounted only while a
 * deck card is open (via `DeckCardModalHost`), so its side-effectful deck hooks
 * (`useDeckDetail` → `loadDeck`/Scryfall resolution) never run on other pages.
 *
 * `oracleKey`/`clickedRowId` identify the open stack; the displayed copies are
 * re-resolved from the live deck store each render (so they track mutations and
 * print changes), mirroring the former `useDeckCardModal` selection logic.
 */
export function useDeckCardModalProps(
	deckId: string,
	oracleKey: string,
	clickedRowId: string,
	onProducerOpen: (oracleKey: string, clickedRowId: string) => void
): {
	props: DeckCardModalProps;
	pendingCollectionAdd: CollectionAddRequest | null;
	setPendingCollectionAdd: (req: CollectionAddRequest | null) => void;
	pendingRemove: PendingRemove | null;
	setPendingRemove: (p: PendingRemove | null) => void;
} {
	const {
		decks: allDecks,
		addCardToDeck,
		removeCardFromDeck,
		changeZone,
		updateDeckCard,
		changeDeckCardPrint,
		replaceDeckCardWithCollectionCopy,
		unassignCollectionCopyFromDeckCard,
		toggleOwned,
		toggleDeckCardWishlist,
		getDeckCards,
	} = useDeckContext();

	const { deck, cardsByZone } = useDeckDetail(deckId);
	const showCommander = deck?.format === 'commander' || deck?.format === 'brawl';
	const { groupByCardId } = useDeckCardSections(cardsByZone, showCommander);

	const { entries } = useCollectionContext();
	const { entries: wishlistEntries } = useWishlistContext();

	const [pendingCollectionAdd, setPendingCollectionAdd] = useState<CollectionAddRequest | null>(
		null
	);
	const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);

	const deckCards = getDeckCards(deckId);

	const zones = useMemo<DeckZone[]>(
		() =>
			showCommander
				? ['commander', 'mainboard', 'sideboard', 'maybeboard']
				: ['mainboard', 'sideboard', 'maybeboard'],
		[showCommander]
	);

	const selectedGroup = groupByCardId.get(oracleKey) ?? null;

	// All copies across all zones, ordered: clicked zone first, then the rest —
	// re-derived live from the store so the modal tracks mutations / print swaps.
	const selectedCards: Card[] | null = useMemo(() => {
		if (!selectedGroup) return null;
		const clickedCard = [...selectedGroup.byZone.values()]
			.flat()
			.find((c) => c.entry.rowId === clickedRowId);
		const clickedZone = clickedCard ? getDeckZone(clickedCard.entry.tags) : null;
		const ordered: Card[] = [];
		if (clickedZone) ordered.push(...(selectedGroup.byZone.get(clickedZone) ?? []));
		for (const [zone, copies] of selectedGroup.byZone) {
			if (zone !== clickedZone) ordered.push(...copies);
		}
		return ordered.length > 0 ? ordered : null;
	}, [selectedGroup, clickedRowId]);

	const selectedZone: DeckZone | null = selectedCards
		? getDeckZone(selectedCards[0].entry.tags)
		: null;

	const selectedScryfallIds = useMemo(
		() => new Set(selectedCards?.map((c) => c.id) ?? []),
		[selectedCards]
	);

	const deckNameById = useMemo(() => new Map(allDecks.map((d) => [d.id, d.name])), [allDecks]);

	// Resolve collection stacks so oracle_id lookups work across editions.
	const { stacks: collectionStacks } = useCollectionCards(entries);

	const collectionScryfallIdToOracleId = useMemo(() => {
		const map = new Map<string, string>();
		for (const stack of collectionStacks) {
			for (const card of stack.cards) {
				if (card.oracle_id) map.set(card.id, card.oracle_id);
			}
		}
		for (const copies of selectedGroup?.byZone.values() ?? []) {
			for (const c of copies) {
				if (c.oracle_id) map.set(c.id, c.oracle_id);
			}
		}
		return map;
	}, [collectionStacks, selectedGroup]);

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
		for (const e of entries) {
			const oracleId = collectionScryfallIdToOracleId.get(e.scryfallId);
			if (oracleId) map.get(oracleId)?.add(e.scryfallId);
		}
		return map;
	}, [collectionScryfallIdToOracleId, entries]);

	// All collection copies (assigned + free) for the selected card, matched by
	// oracle_id (all editions) — copies of a different edition are offered too.
	const collectionCopies = useMemo<CollectionCopyEntry[]>(() => {
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

	// When the open modal shows a token, list the deck cards that generate it,
	// split into sections by zone.
	const producerSections = useMemo((): CardListSection[] | undefined => {
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
			const cards: Card[] = [];
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

	const requestCollectionAdd = useCallback(
		(rowIds: string[]) => {
			const card = selectedCards?.[0];
			if (!card || rowIds.length === 0) return;
			const copies = rowIds
				.map((id) => selectedCards?.find((c) => c.entry.rowId === id))
				.filter((c): c is NonNullable<typeof c> => c != null);
			const req = buildCollectionAddRequest(card.name, copies);
			if (req.unownedRowIds.length > 0) setPendingCollectionAdd(req);
		},
		[selectedCards]
	);

	const onSave = useCallback(
		(rowId: string, updates: Partial<CardEntry>) => updateDeckCard(rowId, updates),
		[updateDeckCard]
	);

	// Removing a deck card that's also owned/wishlisted asks whether to remove it
	// there too; otherwise remove outright.
	const onRemoveEntry = useCallback(
		(rowId: string) => {
			const copy = deckCards[rowId];
			let membership: RemoveDeckCardMembership | null = null;
			if (copy?.entry.ownerId) membership = 'collection';
			else if (copy?.entry.wishlist) membership = 'wishlist';
			if (!copy || membership === null) {
				removeCardFromDeck(rowId);
				return;
			}
			const name = selectedCards?.find((c) => c.entry.rowId === rowId)?.name ?? '';
			setPendingRemove({ rowId, cardName: name, membership });
		},
		[deckCards, removeCardFromDeck, selectedCards]
	);

	const onIncrement = useCallback(() => {
		if (!selectedGroup || !selectedZone) return;
		addCardToDeck(deckId, selectedGroup.representative as unknown as ScryfallCard, selectedZone);
	}, [selectedGroup, selectedZone, deckId, addCardToDeck]);

	const onChangeZone = useCallback(
		(rowId: string, zone: DeckZone) => changeZone(rowId, zone),
		[changeZone]
	);

	const onChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard) => changeDeckCardPrint(rowId, newCard, deckId),
		[changeDeckCardPrint, deckId]
	);

	const onAssignCollectionCopy = useCallback(
		(collectionRowId: string) => {
			const clickedCard = selectedCards?.find((c) => c.entry.rowId === clickedRowId);
			if (!clickedCard) return;
			const zone = getDeckZone(clickedCard.entry.tags);
			replaceDeckCardWithCollectionCopy(clickedCard.entry.rowId, collectionRowId, deckId, zone);
		},
		[selectedCards, clickedRowId, deckId, replaceDeckCardWithCollectionCopy]
	);

	const onUnassignCollectionCopy = useCallback(() => {
		const clickedCard = selectedCards?.find((c) => c.entry.rowId === clickedRowId);
		if (!clickedCard) return;
		const zone = getDeckZone(clickedCard.entry.tags);
		unassignCollectionCopyFromDeckCard(clickedCard.entry.rowId, deckId, zone);
	}, [selectedCards, clickedRowId, deckId, unassignCollectionCopyFromDeckCard]);

	const onProducerClick = useCallback(
		(producerOracleKey: string, producerRowId: string) =>
			onProducerOpen(producerOracleKey, producerRowId),
		[onProducerOpen]
	);

	const renderCopyBadge = useCallback(
		(copy: Card) => {
			const state = getCopyBadgeState(copy, wishlistScryfallIds);
			return (
				<OwnershipBadge
					badgeState={state}
					onClick={state === 'none' ? () => requestCollectionAdd([copy.entry.rowId]) : undefined}
				/>
			);
		},
		[wishlistScryfallIds, requestCollectionAdd]
	);

	const props: DeckCardModalProps = {
		cards: selectedCards,
		initialRowId: clickedRowId,
		zone: selectedZone ?? undefined,
		availableZones: zones,
		onSave,
		onRemoveEntry,
		onIncrement,
		onChangeZone,
		onChangePrint,
		collectionCopies,
		onAssignCollectionCopy,
		onUnassignCollectionCopy,
		onAddToCollectionFromEntry: requestCollectionAdd,
		onRemoveFromCollectionEntry: (rowId) => toggleOwned(rowId),
		onAddToWishlistFromEntry: (deckCardRowId) => toggleDeckCardWishlist(deckCardRowId),
		producerSections,
		onProducerClick,
		renderCopyBadge,
	};

	return {
		props,
		pendingCollectionAdd,
		setPendingCollectionAdd,
		pendingRemove,
		setPendingRemove,
	};
}
