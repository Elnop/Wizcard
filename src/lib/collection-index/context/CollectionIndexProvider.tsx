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
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import {
	deleteFacetsFromCache,
	getFacetsFromCache,
	putFacetsInCache,
} from '@/lib/scryfall/utils/card-cache';
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
 * 'loading' until the cache + RPC have answered for the current user (or, if the
 * RPC failed, until the fallback has); catalog misses and ids added later
 * (import, add-to-collection) arrive without flipping it back.
 */
export function CollectionIndexProvider({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	const userId = user?.id ?? null;
	const { entries: collectionEntries, isLoaded: collectionLoaded } = useCollectionContext();
	const { entries: wishlistEntries, isLoaded: wishlistLoaded } = useWishlistContext();
	const entriesReady = collectionLoaded && wishlistLoaded;

	const [facets, setFacets] = useState<ReadonlyMap<string, IndexedCard>>(() => new Map());
	const [completedOnce, setCompletedOnce] = useState(false);
	const [notFound, setNotFound] = useState<ReadonlySet<string>>(() => new Set());
	const [error, setError] = useState<Error | null>(null);
	const [attempt, setAttempt] = useState(0);
	// Ids loaded, in flight, or known to exist nowhere — never re-requested. Keyed to
	// `settledUserRef`'s user; reset (in the effect) whenever the user changes.
	const settledRef = useRef<Set<string>>(new Set());
	const settledUserRef = useRef<string | null>(userId);

	// Account switch: the collection store drops back to isLoaded=false — the next
	// user's index must report 'loading' again (render-time reset, not an effect).
	if (!entriesReady && completedOnce) setCompletedOnce(false);

	// User-keyed reset: a logout→login (or direct account switch) must drop whatever
	// A's session concluded with, even when `entriesReady` itself never flips false
	// (handleLogout sets isLoaded:true with empty entries) — render-time, not an effect.
	const [trackedUser, setTrackedUser] = useState(userId);
	if (trackedUser !== userId) {
		setTrackedUser(userId);
		setCompletedOnce(false);
		setError(null);
		setNotFound(new Set());
	}

	// Content-keyed, not identity-keyed: an entries mutation that doesn't change the
	// SET of ids (reorders, metadata edits, …) must not restart the effect below.
	const idsKey = useMemo(() => {
		const set = new Set<string>();
		for (const e of collectionEntries) set.add(e.scryfallId);
		for (const e of wishlistEntries) set.add(e.scryfallId);
		return [...set].sort().join(',');
	}, [collectionEntries, wishlistEntries]);
	const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

	useEffect(() => {
		if (!entriesReady) return;
		// New user: the previous user's settled-ness says nothing about this one —
		// even ids that happen to coincide must be (re-)requested.
		if (settledUserRef.current !== userId) {
			settledRef.current = new Set();
			settledUserRef.current = userId;
		}
		const pending = ids.filter((id) => !settledRef.current.has(id));
		if (pending.length === 0) return;
		for (const id of pending) settledRef.current.add(id);
		const cancelled = { current: false };
		// Set once the main load's results (success or per-id not-found) have been
		// recorded. The cleanup only un-settles ids that never got that far — a
		// finished id stays settled even if the run is torn down right after
		// (StrictMode double-invoke, or a later id-set change).
		let finished = false;

		const merge = (add: ReadonlyMap<string, IndexedCard>) => {
			if (cancelled.current || add.size === 0) return;
			setFacets((prev) => new Map([...prev, ...add]));
		};
		const markNotFound = (missing: string[]) => {
			if (missing.length === 0) return;
			setNotFound((prev) => new Set([...prev, ...missing]));
		};
		// A stale id the background refresh no longer finds: its cached facets are
		// gone for good (unmatched/retired print), not just outdated — drop them
		// from memory and from IDB instead of leaving a stale row to re-serve forever.
		const dropStale = (missing: string[]) => {
			if (missing.length === 0) return;
			setFacets((prev) => {
				const next = new Map(prev);
				for (const id of missing) next.delete(id);
				return next;
			});
			void deleteFacetsFromCache(missing);
		};

		void (async () => {
			try {
				const cached = await getFacetsFromCache(pending.filter((id) => !id.startsWith('mpc:')));
				merge(new Map([...cached].map(([id, v]) => [id, v.facets])));
				const toFetch = pending.filter((id) => !cached.has(id));
				const stale = [...cached].filter(([, v]) => v.stale).map(([id]) => id);

				const { found, notFound: missing } = await loadFacets(toFetch, {
					isCancelled: () => cancelled.current,
					// Catalog answered: the grid can start. The few catalog misses
					// (Scryfall fallback, slow throttle queue) join like later-added ids.
					onPrimary: (primary) => {
						merge(primary);
						if (!cancelled.current) setCompletedOnce(true);
					},
				});
				merge(found);
				void putFacetsInCache(onlyFacets(found));
				if (cancelled.current) return;
				finished = true;
				setError(null);
				setCompletedOnce(true);
				markNotFound(missing);

				if (stale.length > 0) {
					// Background refresh: never changes status, failures are only logged.
					try {
						const refreshed = await loadFacets(stale);
						merge(refreshed.found);
						void putFacetsInCache(onlyFacets(refreshed.found));
						markNotFound(refreshed.notFound);
						dropStale(refreshed.notFound);
					} catch (err) {
						console.error('[CollectionIndex] background refresh failed:', err);
					}
				}
			} catch (err) {
				if (!cancelled.current) setError(err instanceof Error ? err : new Error(String(err)));
			}
		})();

		return () => {
			cancelled.current = true;
			// Unfinished ids must be requestable by the next run (StrictMode, new entries).
			if (!finished) for (const id of pending) settledRef.current.delete(id);
		};
	}, [ids, entriesReady, attempt, userId]);

	// Data-derived: 'ready' once every CURRENT id is accounted for (found or
	// known-missing), not just once the latest effect run happened to finish. Covers
	// the case where nothing was pending (already known) and the effect bailed early.
	const allKnown = useMemo(() => {
		for (const id of ids) if (!facets.has(id) && !notFound.has(id)) return false;
		return true;
	}, [ids, facets, notFound]);

	let status: CollectionIndexStatus;
	if (error) status = 'error';
	else if (!entriesReady) status = 'loading';
	else if (completedOnce || allKnown) status = 'ready';
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
