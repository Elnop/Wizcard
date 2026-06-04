'use client';

import { useState, useCallback } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import type { DeckCardGroup } from '@/app/decks/[id]/useDeckCardSections';

type Selection = { oracleId: string; clickedRowId: string; openPrintPicker?: boolean };

export function useDeckCardModal(deckId: string, groupByCardId: Map<string, DeckCardGroup>) {
	const {
		addCardToDeck,
		removeCardFromDeck,
		changeZone,
		updateDeckCard,
		changeDeckCardPrint,
		replaceDeckCardWithCollectionCopy,
	} = useDeckContext();
	const [selection, setSelection] = useState<Selection | null>(null);

	// Derived reactively — auto-updates when the store changes
	const selectedGroup = selection ? (groupByCardId.get(selection.oracleId) ?? null) : null;

	// All copies across all zones, ordered: clicked zone first, then others
	const selectedCards: Card[] | null = selectedGroup
		? (() => {
				const clickedCard = [...selectedGroup.byZone.values()]
					.flat()
					.find((c) => c.entry.rowId === selection!.clickedRowId);
				const clickedZone = clickedCard ? getDeckZone(clickedCard.entry.tags) : null;
				const ordered: Card[] = [];
				if (clickedZone) {
					ordered.push(...(selectedGroup.byZone.get(clickedZone) ?? []));
				}
				for (const [zone, copies] of selectedGroup.byZone) {
					if (zone !== clickedZone) ordered.push(...copies);
				}
				return ordered;
			})()
		: null;

	// The zone to add copies into = zone of the clicked card
	const selectedZone: DeckZone | null = selectedCards
		? getDeckZone(selectedCards[0].entry.tags)
		: null;

	const handleCardGroupClick = useCallback((group: DeckCardGroup, clickedRowId: string) => {
		setSelection({
			oracleId: group.representative.oracle_id ?? group.representative.id,
			clickedRowId,
		});
	}, []);

	const handleCardGroupClickWithPrintPicker = useCallback(
		(group: DeckCardGroup, clickedRowId: string) => {
			setSelection({
				oracleId: group.representative.oracle_id ?? group.representative.id,
				clickedRowId,
				openPrintPicker: true,
			});
		},
		[]
	);

	const handleClose = useCallback(() => setSelection(null), []);

	const handleSave = useCallback(
		(rowId: string, updates: Partial<CardEntry>) => {
			updateDeckCard(rowId, updates);
		},
		[updateDeckCard]
	);

	const handleRemoveEntry = useCallback(
		(rowId: string) => {
			removeCardFromDeck(rowId);
		},
		[removeCardFromDeck]
	);

	const handleAddCopy = useCallback(() => {
		if (!selectedGroup || !selectedZone) return;
		addCardToDeck(deckId, selectedGroup.representative as unknown as ScryfallCard, selectedZone);
	}, [selectedGroup, selectedZone, deckId, addCardToDeck]);

	const handleChangeZone = useCallback(
		(rowId: string, zone: DeckZone) => {
			changeZone(rowId, zone);
		},
		[changeZone]
	);

	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard) => {
			changeDeckCardPrint(rowId, newCard, deckId);
		},
		[changeDeckCardPrint, deckId]
	);

	// Called when the user selects a collection copy in the print picker
	const handleAssignCollectionCopy = useCallback(
		(collectionRowId: string) => {
			if (!selection || !selectedCards) return;
			const clickedCard = selectedCards.find((c) => c.entry.rowId === selection.clickedRowId);
			if (!clickedCard) return;
			const zone = getDeckZone(clickedCard.entry.tags);
			replaceDeckCardWithCollectionCopy(clickedCard.entry.rowId, collectionRowId, deckId, zone);
		},
		[selection, selectedCards, deckId, replaceDeckCardWithCollectionCopy]
	);

	return {
		selectedCards,
		selectedZone,
		clickedRowId: selection?.clickedRowId ?? null,
		openPrintPicker: selection?.openPrintPicker ?? false,
		handleCardGroupClick,
		handleCardGroupClickWithPrintPicker,
		handleClose,
		handleSave,
		handleRemoveEntry,
		handleAddCopy,
		handleChangeZone,
		handleChangePrint,
		handleAssignCollectionCopy,
	};
}
