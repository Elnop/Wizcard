'use client';

import { useMemo, useCallback } from 'react';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import type { ResolvedDeckCard } from './useDeckDetail';

export type AddDeckToCollectionOptions = {
	onlyMissing: boolean;
	asProxy: boolean;
	removeWishlist: boolean;
};

type UseAddDeckToCollectionResult = {
	ownedCount: number;
	unownedCount: number;
	wishlistMatchCount: number;
	execute: (options: AddDeckToCollectionOptions) => void;
};

export function useAddDeckToCollection(
	resolvedCards: ResolvedDeckCard[],
	deckId: string
): UseAddDeckToCollectionResult {
	const { addCard } = useCollectionContext();
	const { toggleOwned } = useDeckContext();
	const { entries: wishlistEntries, removeFromWishlist } = useWishlistContext();

	const ownedCount = useMemo(
		() => resolvedCards.filter((rc) => rc.entry.ownerId != null).length,
		[resolvedCards]
	);

	const unownedCount = useMemo(
		() => resolvedCards.filter((rc) => rc.entry.ownerId == null).length,
		[resolvedCards]
	);

	// Collect scryfallIds of all deck cards
	const deckScryfallIds = useMemo(() => new Set(resolvedCards.map((rc) => rc.id)), [resolvedCards]);

	// Wishlist entries whose print is in the deck
	const matchingWishlistRowIds = useMemo(
		() =>
			wishlistEntries.filter((w) => deckScryfallIds.has(w.scryfallId)).map((w) => w.entry.rowId),
		[wishlistEntries, deckScryfallIds]
	);

	const wishlistMatchCount = matchingWishlistRowIds.length;

	const execute = useCallback(
		(options: AddDeckToCollectionOptions) => {
			const toProcess = options.onlyMissing
				? resolvedCards.filter((rc) => rc.entry.ownerId == null)
				: resolvedCards;

			for (const rc of toProcess) {
				// Add to collection (assigned to this deck, optionally as proxy)
				addCard({ id: rc.id } as Parameters<typeof addCard>[0], {
					proxy: options.asProxy || undefined,
					deckId,
				});
				// Mark the deck copy as owned — toggleOwned persists owner_id to DB
				// and updates activeDeckCards. Skip if already owned to avoid toggling off.
				if (rc.entry.ownerId == null) {
					toggleOwned(rc.entry.rowId);
				}
			}

			if (options.removeWishlist) {
				for (const rowId of matchingWishlistRowIds) {
					removeFromWishlist(rowId);
				}
			}
		},
		[resolvedCards, deckId, addCard, toggleOwned, matchingWishlistRowIds, removeFromWishlist]
	);

	return { ownedCount, unownedCount, wishlistMatchCount, execute };
}
