'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import {
	collectDeckTokenIds,
	collectDeckTokensWithSourceLang,
} from '@/lib/deck/utils/collectDeckTokens';
import { localizeTokens } from '@/lib/scryfall/localizeTokens';
import type { ResolvedDeckCard } from './useDeckDetail';

/**
 * Collect the tokens required by the cards in the selected zones and add one copy
 * of each unique missing token to the deck's `tokens` zone.
 */
export function useDeckTokens(
	deckId: string,
	cardsByZone: Record<DeckZone, ResolvedDeckCard[]>,
	existingTokens: ResolvedDeckCard[]
) {
	const { bulkAddCardsToDeck } = useDeckContext();
	const [isAdding, setIsAdding] = useState(false);

	const cancelledRef = useRef(false);
	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	const addTokens = useCallback(
		async (scanZones: DeckZone[]) => {
			setIsAdding(true);
			try {
				const sourceCards = scanZones.flatMap((zone) => cardsByZone[zone] ?? []);
				const tokenIds = collectDeckTokenIds(sourceCards);
				if (tokenIds.length === 0) return;

				const langByTokenId = collectDeckTokensWithSourceLang(sourceCards);
				const existingKeys = new Set(existingTokens.map((t) => t.oracle_id ?? t.id));

				const resolvedMap = await resolveCardsByScryfallIds(tokenIds);
				if (cancelledRef.current) return;

				const localizedTokens = await localizeTokens([...resolvedMap.values()], langByTokenId);
				if (cancelledRef.current) return;

				const seen = new Set(existingKeys);
				const survivors = [];
				for (const card of localizedTokens) {
					const key = card.oracle_id ?? card.id;
					if (seen.has(key)) continue;
					seen.add(key);
					survivors.push(card);
				}

				if (survivors.length > 0) {
					bulkAddCardsToDeck(
						deckId,
						survivors.map((card) => ({ card, zone: 'tokens' as DeckZone, quantity: 1 }))
					);
				}
			} finally {
				if (!cancelledRef.current) setIsAdding(false);
			}
		},
		[deckId, cardsByZone, existingTokens, bulkAddCardsToDeck]
	);

	return { addTokens, isAdding };
}
