'use client';

import { useMemo, useCallback } from 'react';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { getDeckZone } from '@/types/decks';
import { isBasicLand } from '@/lib/deck/utils/format-rules';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from './useDeckDetail';

export type AddDeckToCollectionOptions = {
	onlyMissing: boolean;
	asProxy: boolean;
	ignoreBasicLands: boolean;
	zones?: DeckZone[];
};

export type ZoneStat = {
	total: number;
	owned: number;
	basics: number;
	unownedBasics: number;
};

type UseAddDeckToCollectionResult = {
	ownedCount: number;
	unownedCount: number;
	zoneStats: Record<DeckZone, ZoneStat>;
	availableZones: DeckZone[];
	execute: (options: AddDeckToCollectionOptions) => void;
};

const ZONE_ORDER: DeckZone[] = ['commander', 'mainboard', 'sideboard', 'maybeboard', 'tokens'];

export function useAddDeckToCollection(
	resolvedCards: ResolvedDeckCard[]
): UseAddDeckToCollectionResult {
	const { toggleOwned } = useDeckContext();

	const ownedCount = useMemo(
		() => resolvedCards.filter((rc) => rc.entry.ownerId != null).length,
		[resolvedCards]
	);

	const unownedCount = useMemo(
		() => resolvedCards.filter((rc) => rc.entry.ownerId == null).length,
		[resolvedCards]
	);

	const zoneStats = useMemo((): Record<DeckZone, ZoneStat> => {
		const stats: Record<DeckZone, ZoneStat> = {
			commander: { total: 0, owned: 0, basics: 0, unownedBasics: 0 },
			mainboard: { total: 0, owned: 0, basics: 0, unownedBasics: 0 },
			sideboard: { total: 0, owned: 0, basics: 0, unownedBasics: 0 },
			maybeboard: { total: 0, owned: 0, basics: 0, unownedBasics: 0 },
			tokens: { total: 0, owned: 0, basics: 0, unownedBasics: 0 },
		};
		for (const rc of resolvedCards) {
			const zone = getDeckZone(rc.entry.tags);
			const owned = rc.entry.ownerId != null;
			stats[zone].total += 1;
			if (owned) stats[zone].owned += 1;
			if (isBasicLand(rc)) {
				stats[zone].basics += 1;
				if (!owned) stats[zone].unownedBasics += 1;
			}
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
				if (options.ignoreBasicLands && isBasicLand(rc)) return false;
				if (options.onlyMissing) return rc.entry.ownerId == null;
				return true;
			});

			for (const rc of toProcess) {
				if (rc.entry.ownerId == null) {
					toggleOwned(rc.entry.rowId, options.asProxy || undefined);
				}
			}
		},
		[resolvedCards, toggleOwned]
	);

	return { ownedCount, unownedCount, zoneStats, availableZones, execute };
}
