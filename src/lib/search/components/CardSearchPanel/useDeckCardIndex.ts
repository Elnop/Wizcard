'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { buildDeckCardIndex, type DeckCardIndex, type DeckCopyForIndex } from './deck-card-index';

/**
 * Builds an oracle_id → (zone → count) index for the cards currently in
 * `deckId`, resolving each copy's scryfallId to its oracle_id via the Scryfall
 * cache. Exposes `getDeckZones(oracleId)` for the search panel to look up
 * whether a result card is already in the deck. Returns undefined for cards not
 * in the deck.
 */
export function useDeckCardIndex(deckId: string): {
	getDeckZones: (oracleId: string | undefined) => Map<DeckZone, number> | undefined;
} {
	const { decksCards } = useDeckContext();

	// scryfallId → oracle_id, accumulated as we resolve.
	const [oracleByScryfallId, setOracleByScryfallId] = useState<Record<string, string>>({});
	const resolvedIdsRef = useRef<Set<string>>(new Set());
	const generationRef = useRef(0);

	const deckCards = decksCards[deckId];
	const copies = useMemo(() => (deckCards ? Object.values(deckCards) : []), [deckCards]);

	// Resolve oracle_ids for any scryfallIds we haven't resolved yet.
	useEffect(() => {
		const uniqueIds = [...new Set(copies.map((c) => c.scryfallId))];
		const toResolve = uniqueIds.filter((id) => !resolvedIdsRef.current.has(id));
		if (toResolve.length === 0) return;

		const generation = ++generationRef.current;
		void (async () => {
			const resolvedMap = await resolveCardsByScryfallIds(toResolve, {
				isCancelled: () => generationRef.current !== generation,
			});
			if (generationRef.current !== generation) return;
			const additions: Record<string, string> = {};
			for (const [scryfallId, card] of resolvedMap) {
				resolvedIdsRef.current.add(scryfallId);
				if (card.oracle_id) additions[scryfallId] = card.oracle_id;
			}
			if (Object.keys(additions).length > 0) {
				setOracleByScryfallId((prev) => ({ ...prev, ...additions }));
			}
		})();
	}, [copies]);

	const index: DeckCardIndex = useMemo(() => {
		const forIndex: DeckCopyForIndex[] = copies.map((c) => ({
			oracleId: oracleByScryfallId[c.scryfallId],
			tags: c.entry.tags,
		}));
		return buildDeckCardIndex(forIndex);
	}, [copies, oracleByScryfallId]);

	return useMemo(
		() => ({
			getDeckZones: (oracleId: string | undefined) => (oracleId ? index.get(oracleId) : undefined),
		}),
		[index]
	);
}
