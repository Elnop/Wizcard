'use client';

import { useEffect, useMemo, useState } from 'react';
import { oracleIdsByPrintIds, printIdsByOracleIds } from '@/lib/card/catalog-db';
import { useCollectionIndex } from '@/lib/collection-index/context/CollectionIndexProvider';

type StoredCopy = { scryfallId: string };

/** Stable identity so consumers' useMemo deps don't churn on the empty path. */
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/**
 * `scryfallId → oracle_id` for the deck's prints and for the collection entries
 * that could substitute for them.
 *
 * Why not `useCollectionCards(entries)`: that resolves EVERY entry of the
 * collection into a full Card, which for a large collection means hundreds of
 * batched POSTs to `/api/scryfall/cards/collection` (4 817 prints ≈ 65 requests)
 * just to read one field per card. The consumers of this map only ever compare a
 * collection entry's oracle_id against a DECK card's oracle_id
 * (`findFreeCollectionCopy` pass 2), so entries that share no oracle_id with the
 * deck can never match and never needed resolving.
 *
 * The deck side is always a narrow catalog query (the deck prints' oracle_ids).
 * The owned side has two modes: once the global collection index is `'ready'`,
 * it reads straight from `getFacets` (already loaded for every owned/wishlisted
 * print, including ones missing from the catalog via its Scryfall fallback) —
 * no second catalog query. While the index is still loading, `getFacets` can be
 * missing ids that are genuinely owned, so the owned side instead falls back to
 * the old catalog intersection query (every print id sharing the deck's
 * oracle_ids, kept where the entries on hand own it) so a substitutable copy is
 * never missed mid-load.
 *
 * Ids missing from the catalog/index (and `mpc:` custom ids without an
 * oracle_id) are simply absent; callers already treat a missing oracle_id as
 * "no match".
 */
export function useCollectionOracleIds(
	deckScryfallIds: string[],
	entries: StoredCopy[]
): ReadonlyMap<string, string> {
	const [map, setMap] = useState<Map<string, string>>(() => new Map());
	const [fallbackOwned, setFallbackOwned] = useState<Map<string, string>>(() => new Map());
	const { getFacets, status } = useCollectionIndex();
	const indexReady = status === 'ready';

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
				setMap(deckMap);

				if (indexReady) {
					// The index memo below already covers the owned side; drop any
					// stale fallback from an earlier, still-loading render.
					setFallbackOwned(new Map());
					return;
				}

				// Index not ready yet: every print of the deck's logical cards, then
				// keep only the ones the user actually owns — the pre-index behaviour.
				const oracleIds = [...new Set(deckMap.values())];
				const printsForOracles = await printIdsByOracleIds(oracleIds);
				if (cancelled) return;

				const owned = new Set(entriesKey ? entriesKey.split(',') : []);
				const fallback = new Map<string, string>();
				for (const [printId, oracleId] of printsForOracles) {
					if (owned.has(printId)) fallback.set(printId, oracleId);
				}
				setFallbackOwned(fallback);
			} catch (err) {
				// Never break the page over this: an empty map degrades to "no
				// substitutable copy found", which is the pre-resolution behaviour.
				console.error('[useCollectionOracleIds] catalog lookup failed:', err);
				if (!cancelled) {
					setMap(new Map());
					setFallbackOwned(new Map());
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [deckKey, entriesKey, indexReady]);

	// Owned side, index mode: straight from the global index (already loaded,
	// includes prints the catalog lacks via the Scryfall fallback).
	const indexOwned = useMemo(() => {
		const m = new Map<string, string>();
		for (const id of entriesKey ? entriesKey.split(',') : []) {
			const f = getFacets(id);
			if (f?.oracle_id) m.set(id, f.oracle_id);
		}
		return m;
	}, [entriesKey, getFacets]);

	// Owned side, pre-ready mode: the catalog-intersection fallback computed above.
	const owned = indexReady ? indexOwned : fallbackOwned;

	// Derived at render rather than stored: with no deck prints there is nothing to
	// match, and this also drops a stale map from a previous deck without an extra
	// state write (the effect bails out in that case).
	return useMemo(() => (deckKey ? new Map([...owned, ...map]) : EMPTY_MAP), [deckKey, owned, map]);
}
