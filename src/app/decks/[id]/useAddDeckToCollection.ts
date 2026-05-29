'use client';

import { useMemo, useCallback } from 'react';
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
	_deckId: string
): UseAddDeckToCollectionResult {
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
				if (rc.entry.ownerId == null) {
					toggleOwned(rc.entry.rowId, options.asProxy || undefined);
				}
			}

			if (options.removeWishlist) {
				for (const rowId of matchingWishlistRowIds) {
					removeFromWishlist(rowId);
				}
			}
		},
		[resolvedCards, toggleOwned, matchingWishlistRowIds, removeFromWishlist]
	);

	return { ownedCount, unownedCount, wishlistMatchCount, execute };
}
