'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { getDeckZone } from '@/types/decks';
import type { DeckMeta, DeckZone } from '@/types/decks';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { ResolvedDeckCard } from './useDeckDetail';

/**
 * Copy a (public) deck into the CURRENT user's account. Creates a brand-new deck
 * owned by the visitor and bulk-inserts fresh card rows into it — it never
 * touches the source deck's rows (so it does not, and cannot, use the owner-only
 * `toggleOwned` claim flow). Requires an authenticated user.
 */
export function useCopyDeckToMyCollection(): {
	copyDeck: (source: DeckMeta, cards: ResolvedDeckCard[]) => Promise<void>;
	isCopying: boolean;
} {
	const { createDeck, bulkAddCardsToDeck } = useDeckContext();
	const router = useRouter();
	const [isCopying, setIsCopying] = useState(false);

	const copyDeck = useCallback(
		async (source: DeckMeta, cards: ResolvedDeckCard[]) => {
			if (cards.length === 0) return;
			setIsCopying(true);
			try {
				const newDeckId = createDeck(
					`${source.name} (copie)`,
					source.format,
					source.description ?? null
				);

				// Aggregate individual copies into { card, zone, quantity } groups,
				// keyed by scryfall print + zone.
				const grouped = new Map<string, { card: ScryfallCard; zone: DeckZone; quantity: number }>();
				for (const rc of cards) {
					const zone = getDeckZone(rc.entry.tags);
					const key = `${rc.id}:${zone}`;
					const existing = grouped.get(key);
					if (existing) {
						existing.quantity += 1;
					} else {
						grouped.set(key, { card: rc as ScryfallCard, zone, quantity: 1 });
					}
				}

				bulkAddCardsToDeck(newDeckId, [...grouped.values()]);
				router.push(`/decks/${newDeckId}`);
			} finally {
				setIsCopying(false);
			}
		},
		[createDeck, bulkAddCardsToDeck, router]
	);

	return { copyDeck, isCopying };
}
