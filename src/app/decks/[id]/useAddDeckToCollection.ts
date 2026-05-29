'use client';

import { useMemo, useCallback } from 'react';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { getDeckZone } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from './useDeckDetail';

export type AddDeckToCollectionOptions = {
	onlyMissing: boolean;
	asProxy: boolean;
	removeWishlist: boolean;
	zones?: DeckZone[];
};

export type ZoneStat = { total: number; owned: number };

type UseAddDeckToCollectionResult = {
	ownedCount: number;
	unownedCount: number;
	wishlistMatchCount: number;
	zoneStats: Record<DeckZone, ZoneStat>;
	availableZones: DeckZone[];
	execute: (options: AddDeckToCollectionOptions) => void;
};

const ZONE_ORDER: DeckZone[] = ['commander', 'mainboard', 'sideboard', 'maybeboard'];

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

	const zoneStats = useMemo((): Record<DeckZone, ZoneStat> => {
		const stats: Record<DeckZone, ZoneStat> = {
			commander: { total: 0, owned: 0 },
			mainboard: { total: 0, owned: 0 },
			sideboard: { total: 0, owned: 0 },
			maybeboard: { total: 0, owned: 0 },
		};
		for (const rc of resolvedCards) {
			const zone = getDeckZone(rc.entry.tags);
			stats[zone].total += 1;
			if (rc.entry.ownerId != null) stats[zone].owned += 1;
		}
		return stats;
	}, [resolvedCards]);

	const availableZones = useMemo(
		() => ZONE_ORDER.filter((z) => zoneStats[z].total > 0),
		[zoneStats]
	);

	const execute = useCallback(
		(options: AddDeckToCollectionOptions) => {
			const zonesToProcess = options.zones ?? ZONE_ORDER;
			const zoneSet = new Set(zonesToProcess);
			const toProcess = resolvedCards.filter((rc) => {
				const zone = getDeckZone(rc.entry.tags);
				if (!zoneSet.has(zone)) return false;
				if (options.onlyMissing) return rc.entry.ownerId == null;
				return true;
			});

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

	return { ownedCount, unownedCount, wishlistMatchCount, zoneStats, availableZones, execute };
}
