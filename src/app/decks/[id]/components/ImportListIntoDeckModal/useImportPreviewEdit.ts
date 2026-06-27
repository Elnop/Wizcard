import { useCallback, useEffect, useState } from 'react';
import type { Card, CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { setDeckZone } from '@/types/decks';
import { isBasicLand } from '@/lib/deck/utils/format-rules';
import type { ResolvedDeckRow } from '@/lib/import/hooks/useResolveDeckList';

/** Same dedup key as dedupeByOracle in useDeckCardSections. */
export function oracleKey(card: ScryfallCard): string {
	return card.oracle_id ?? card.id;
}

export type ZoneMode = 'fallback' | 'force';

/** Inputs that build the initial editable preview ("globals = initial state"). */
export type PreviewInit = {
	resolvedRows: ResolvedDeckRow[];
	existingOracleIds: Set<string>;
	zone: DeckZone;
	zoneMode: ZoneMode;
	hasSections: boolean;
	ignoreExisting: boolean;
	ignoreBasicLands: boolean;
};

/** One editable copy: a Scryfall card carrying a synthetic deck CardEntry. */
export type EditableCard = Card;

function targetZone(row: ResolvedDeckRow, init: PreviewInit): DeckZone {
	if (init.zoneMode === 'force') return init.zone;
	return init.hasSections ? row.zone : init.zone;
}

/** Expand resolved rows into one editable Card per copy, applying the global pre-filters. */
function buildEditableCards(init: PreviewInit): EditableCard[] {
	const cards: EditableCard[] = [];
	for (const row of init.resolvedRows) {
		const isDuplicate = init.existingOracleIds.has(oracleKey(row.card));
		if (init.ignoreExisting && isDuplicate) continue;
		if (init.ignoreBasicLands && isBasicLand(row.card)) continue;

		const zone = targetZone(row, init);
		for (let i = 0; i < row.quantity; i++) {
			const entry: CardEntry = {
				rowId: crypto.randomUUID(),
				dateAdded: new Date().toISOString(),
				tags: setDeckZone(undefined, zone),
			};
			cards.push({ ...row.card, entry });
		}
	}
	return cards;
}

/**
 * Editable preview state for the import-into-deck modal.
 *
 * The four global toggles (zone, zoneMode, ignoreExisting, ignoreBasicLands)
 * build the *initial* list; whenever they change the list is regenerated, which
 * discards manual edits by design ("globals = initial state, edits win after").
 * Per-card mutators then let the user tweak zone, quantity, print, and removal.
 */
export function useImportPreviewEdit(init: PreviewInit) {
	const [cards, setCards] = useState<EditableCard[]>([]);

	// Regenerate the editable list whenever the resolved rows or any global changes.
	useEffect(() => {
		setCards(buildEditableCards(init));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the init primitives below
	}, [
		init.resolvedRows,
		init.existingOracleIds,
		init.zone,
		init.zoneMode,
		init.hasSections,
		init.ignoreExisting,
		init.ignoreBasicLands,
	]);

	const setCardZone = useCallback((rowId: string, zone: DeckZone) => {
		setCards((prev) =>
			prev.map((c) =>
				c.entry.rowId === rowId
					? { ...c, entry: { ...c.entry, tags: setDeckZone(c.entry.tags, zone) } }
					: c
			)
		);
	}, []);

	/** Add one more copy of a card to a zone (clones an existing copy's print). */
	const incrementCard = useCallback((sample: EditableCard, zone: DeckZone) => {
		const entry: CardEntry = {
			rowId: crypto.randomUUID(),
			dateAdded: new Date().toISOString(),
			tags: setDeckZone(undefined, zone),
		};
		setCards((prev) => [...prev, { ...sample, entry }]);
	}, []);

	/** Remove a single copy by its synthetic rowId. */
	const removeRow = useCallback((rowId: string) => {
		setCards((prev) => prev.filter((c) => c.entry.rowId !== rowId));
	}, []);

	/** Remove every copy of a card within a zone (used by the context menu / detail). */
	const removeCardInZone = useCallback((scryfallId: string, zone: DeckZone) => {
		setCards((prev) =>
			prev.filter((c) => !(c.id === scryfallId && (c.entry.tags ?? []).includes(`deck:${zone}`)))
		);
	}, []);

	const changePrint = useCallback((rowId: string, newCard: ScryfallCard) => {
		setCards((prev) =>
			prev.map((c) => (c.entry.rowId === rowId ? { ...newCard, entry: c.entry } : c))
		);
	}, []);

	const updateEntry = useCallback((rowId: string, updates: Partial<CardEntry>) => {
		setCards((prev) =>
			prev.map((c) => (c.entry.rowId === rowId ? { ...c, entry: { ...c.entry, ...updates } } : c))
		);
	}, []);

	return {
		cards,
		setCardZone,
		incrementCard,
		removeRow,
		removeCardInZone,
		changePrint,
		updateEntry,
	};
}
