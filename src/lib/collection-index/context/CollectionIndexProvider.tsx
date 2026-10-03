'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { CardFacets, IndexedCard } from '@/types/cards';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { getFacetsFromCache, putFacetsInCache } from '@/lib/scryfall/utils/card-cache';
import { loadFacets } from '../load-facets';
import { oracleKeyOf } from '../facets';

export type CollectionIndexStatus = 'loading' | 'ready' | 'error';

export interface CollectionIndex {
	status: CollectionIndexStatus;
	error: Error | null;
	getFacets: (scryfallId: string) => IndexedCard | undefined;
	printsForOracle: (oracleKey: string) => string[];
	retry: () => void;
}

const CollectionIndexContext = createContext<CollectionIndex | null>(null);

/** Custom cards are re-read from their (local) table each session, never cached here. */
const onlyFacets = (m: ReadonlyMap<string, IndexedCard>): CardFacets[] =>
	[...m.values()].filter((f): f is CardFacets => !('custom' in f));

/**
 * Global index: every print owned or wished → its facets (sort/filter/group facts).
 * One role only — it owns neither the entries nor the full cards.
 *
 * Load order per new id: IDB (30-day TTL; stale rows are used then refreshed in
 * background) → card_facets RPC → Scryfall fallback (loadFacets). `status` is
 * 'loading' until the FIRST complete load for the current user; ids added later
 * (import, add-to-collection) arrive without flipping it back.
 */
export function CollectionIndexProvider({ children }: { children: React.ReactNode }) {
	const { entries: collectionEntries, isLoaded: collectionLoaded } = useCollectionContext();
	const { entries: wishlistEntries, isLoaded: wishlistLoaded } = useWishlistContext();
	const entriesReady = collectionLoaded && wishlistLoaded;

	const [facets, setFacets] = useState<ReadonlyMap<string, IndexedCard>>(() => new Map());
	const [completedOnce, setCompletedOnce] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [attempt, setAttempt] = useState(0);
	// Ids loaded, in flight, or known to exist nowhere — never re-requested.
	const settledRef = useRef<Set<string>>(new Set());

	// Account switch: the collection store drops back to isLoaded=false — the next
	// user's index must report 'loading' again (render-time reset, not an effect).
	if (!entriesReady && completedOnce) setCompletedOnce(false);

	const ids = useMemo(() => {
		const set = new Set<string>();
		for (const e of collectionEntries) set.add(e.scryfallId);
		for (const e of wishlistEntries) set.add(e.scryfallId);
		return [...set];
	}, [collectionEntries, wishlistEntries]);

	useEffect(() => {
		if (!entriesReady) return;
		const pending = ids.filter((id) => !settledRef.current.has(id));
		if (pending.length === 0) return;
		for (const id of pending) settledRef.current.add(id);
		const cancelled = { current: false };

		const merge = (add: ReadonlyMap<string, IndexedCard>) => {
			if (cancelled.current || add.size === 0) return;
			setFacets((prev) => new Map([...prev, ...add]));
		};

		void (async () => {
			try {
				const cached = await getFacetsFromCache(pending.filter((id) => !id.startsWith('mpc:')));
				merge(new Map([...cached].map(([id, v]) => [id, v.facets])));
				const toFetch = pending.filter((id) => !cached.has(id));
				const stale = [...cached].filter(([, v]) => v.stale).map(([id]) => id);

				const { found } = await loadFacets(toFetch, { isCancelled: () => cancelled.current });
				merge(found);
				void putFacetsInCache(onlyFacets(found));
				if (cancelled.current) return;
				setError(null);
				setCompletedOnce(true);

				if (stale.length > 0) {
					// Background refresh: never changes status, failures are only logged.
					try {
						const refreshed = await loadFacets(stale);
						merge(refreshed.found);
						void putFacetsInCache(onlyFacets(refreshed.found));
					} catch (err) {
						console.error('[CollectionIndex] background refresh failed:', err);
					}
				}
			} catch (err) {
				for (const id of pending) settledRef.current.delete(id);
				if (!cancelled.current) setError(err instanceof Error ? err : new Error(String(err)));
			}
		})();

		return () => {
			cancelled.current = true;
			// Unfinished ids must be requestable by the next run (StrictMode, new entries).
			// settledRef is a plain Set, not a DOM ref — safe to read/mutate in cleanup.
			// eslint-disable-next-line react-hooks/exhaustive-deps
			for (const id of pending) if (!facets.has(id)) settledRef.current.delete(id);
		};
		// `facets` is read only in the cleanup, to keep finished ids settled.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ids, entriesReady, attempt]);

	let status: CollectionIndexStatus;
	if (error) status = 'error';
	else if (entriesReady && (ids.length === 0 || completedOnce)) status = 'ready';
	else status = 'loading';

	const getFacets = useCallback((id: string) => facets.get(id), [facets]);

	const oracleIndex = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const id of ids) {
			const f = facets.get(id);
			if (!f) continue;
			const key = oracleKeyOf(f);
			const list = map.get(key);
			if (list) list.push(id);
			else map.set(key, [id]);
		}
		return map;
	}, [ids, facets]);
	const printsForOracle = useCallback((key: string) => oracleIndex.get(key) ?? [], [oracleIndex]);

	const retry = useCallback(() => {
		setError(null);
		setAttempt((a) => a + 1);
	}, []);

	const value = useMemo<CollectionIndex>(
		() => ({ status, error, getFacets, printsForOracle, retry }),
		[status, error, getFacets, printsForOracle, retry]
	);
	return <CollectionIndexContext value={value}>{children}</CollectionIndexContext>;
}

export function useCollectionIndex(): CollectionIndex {
	const ctx = useContext(CollectionIndexContext);
	if (!ctx) throw new Error('useCollectionIndex must be used within a CollectionIndexProvider');
	return ctx;
}
