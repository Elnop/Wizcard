'use client';

import { useEffect, useState } from 'react';
import { oracleIdsByPrintIds, printIdsByOracleIds } from '@/lib/card/catalog-db';

type StoredCopy = { scryfallId: string };

/** Stable identity so consumers' useMemo deps don't churn on the empty path. */
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/**
 * `scryfallId → oracle_id` for the deck's prints and for the collection entries
 * that could substitute for them — read straight from the DB catalog.
 *
 * Why not `useCollectionCards(entries)`: that resolves EVERY entry of the
 * collection into a full Card, which for a large collection means hundreds of
 * batched POSTs to `/api/scryfall/cards/collection` (4 817 prints ≈ 65 requests)
 * just to read one field per card. The consumers of this map only ever compare a
 * collection entry's oracle_id against a DECK card's oracle_id
 * (`findFreeCollectionCopy` pass 2), so entries that share no oracle_id with the
 * deck can never match and never needed resolving.
 *
 * Two narrow catalog queries replace that:
 *   1. the deck prints' oracle_ids,
 *   2. every print id sharing those oracle_ids — intersected with the entries on
 *      hand, which yields exactly the substitutable copies.
 *
 * Ids missing from the catalog (and `mpc:` custom ids) are simply absent; callers
 * already treat a missing oracle_id as "no match".
 */
export function useCollectionOracleIds(
	deckScryfallIds: string[],
	entries: StoredCopy[]
): ReadonlyMap<string, string> {
	const [map, setMap] = useState<Map<string, string>>(() => new Map());

	// Identity-stable keys: the effect must re-run when the *contents* change,
	// not on every render (both arrays are rebuilt upstream each time).
	const deckKey = [...new Set(deckScryfallIds)].sort().join(',');
	const entriesKey = [...new Set(entries.map((e) => e.scryfallId))].sort().join(',');

	useEffect(() => {
		const deckIds = deckKey ? deckKey.split(',') : [];
		// Nothing to look up: the render-time guard below already yields an empty
		// map, so the effect must not setState here (cascading render).
		if (deckIds.length === 0) return;
		let cancelled = false;

		void (async () => {
			try {
				const deckMap = await oracleIdsByPrintIds(deckIds);
				if (cancelled) return;

				const oracleIds = [...new Set(deckMap.values())];
				// Every print of those logical cards, then keep only the ones the user
				// actually owns — the collection is the small side of this intersection.
				const printsForOracles = await printIdsByOracleIds(oracleIds);
				if (cancelled) return;

				const owned = new Set(entriesKey ? entriesKey.split(',') : []);
				const merged = new Map(deckMap);
				for (const [printId, oracleId] of printsForOracles) {
					if (owned.has(printId)) merged.set(printId, oracleId);
				}
				setMap(merged);
			} catch (err) {
				// Never break the page over this: an empty map degrades to "no
				// substitutable copy found", which is the pre-resolution behaviour.
				console.error('[useCollectionOracleIds] catalog lookup failed:', err);
				if (!cancelled) setMap(new Map());
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [deckKey, entriesKey]);

	// Derived at render rather than stored: with no deck prints there is nothing to
	// match, and this also drops a stale map from a previous deck without an extra
	// state write (the effect bails out in that case).
	return deckKey ? map : EMPTY_MAP;
}
