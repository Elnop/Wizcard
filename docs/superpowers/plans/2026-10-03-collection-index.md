# Collection Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the first page of `/collection` and `/wishlist` fast, have the next page ready on scroll, keep filters/sort/stats instant, and give the site a global per-print "facets" index with an explicit loading state.

**Architecture:** A light global index (`CollectionIndexProvider`) maps every owned/wished print id to `CardFacets` (the fields sort/filter/group need), loaded from IDB then a `card_facets(uuid[])` RPC, with a Scryfall fallback for prints missing from the catalog. The grids sort/filter/group on facets and resolve **full** cards only for the visible page + 1 page ahead, through `resolveCardsByScryfallIds`, whose network step now reads the DB catalog directly (chunked, parallel) before falling back to the proxy/Scryfall.

**Tech Stack:** Next.js (App Router, client components), React 19, Zustand, Supabase (PostgREST + Postgres functions), IndexedDB, TypeScript, `tsx` for throwaway checks.

**Spec:** `docs/superpowers/specs/2026-10-03-collection-index-design.md`

## Global Constraints

- Work on branch `feat/collection-index` (never commit on `main`).
- The working tree has **unrelated uncommitted changes** (image-size work: `CardImage.tsx`, `derive-art-crop.ts`, `types/cards.ts`, `scryfall-image-size.ts`, …). Always `git add <exact paths>`; never `git add -A` / `git commit -a`. `src/types/cards.ts` is already modified by that work: stage it with `git add -p` and take only your hunk.
- No test framework exists. "Tests" = throwaway `tsx` scripts in the scratchpad + `psql` + browser. Throwaway scripts live in `$SCRATCH=/tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/76e58422-98b0-4b1e-af15-d34223a9f871/scratchpad` and are never committed. Run them with `npx tsx --tsconfig tsconfig.json --env-file=.env.local $SCRATCH/<file>.ts` (`.env.local` points at local Supabase `127.0.0.1`).
- `npm run check` is red at baseline. Gate per task: `npx tsc --noEmit 2>&1 | grep -E '<changed files>'` prints nothing, `npx eslint <changed files>` clean, `npx prettier --check <changed files>` clean.
- `npm run build` must pass before the end of each phase (only it catches TS2589 and server-only import leaks).
- Supabase query builders: never chain filters inside a `let q = client.from()...` initializer (TS2589). Use `const base = …; const scoped = cond ? base.a() : base.b();`.
- Never import `@/lib/supabase/server` from these client modules.
- Migrations are idempotent (`create or replace`, `grant`), comments in French like the existing ones, explicit `grant execute ... to anon, authenticated`.
- Page size stays `PAGE_SIZE = 48` (`src/lib/collection/constants.ts`); prefetch = 1 page.
- Index IDB TTL = 30 days; full-card IDB TTL stays 24 h.
- `CardStack` / `CardCopy` types do not change.
- React state reset on input change uses the render-time pattern (`if (tracked !== key) { setTracked(key); … }`), not `useEffect`.

## Review Focus

1. **Non-UUID ids in a uuid query** — `mpc:` ids or a malformed `scryfall_id` sent to `.in('id', …)` or to `card_facets(uuid[])` make Postgres reject the **whole** chunk/call. Expected: invalid ids are filtered out client-side and routed to their own path; one bad id never blanks 150 cards. Pinned in Task 2 and Task 4 checks.
2. **Entry whose print is in no catalog and not on Scryfall** — expected: excluded from the grid with a `console.warn` count, the page still becomes ready (never an infinite skeleton). Pinned in Task 6 check + Task 13 runtime.
3. **Page fetch error during entries hydration** — today a failed page silently truncates the collection and the truncated set overwrites the IDB cache. Expected: on error the cached entries stay, the cache is not replaced, the UI is not stuck. Pinned in Task 1 check.
4. **Card modal opened on a stack whose other prints were never resolved** (e.g. collection copies of a card while on `/wishlist`, or a copy outside the visible window) — expected: the modal shows every copy of that oracle once resolved, not just the clicked print. Pinned in Task 12 runtime.
5. **Filters changed while a page is resolving** — expected: pagination resets to page 1, the stale resolution is cancelled, no setState after unmount, no flash of the previous filter's cards. Pinned in Task 9 + Task 13 runtime.

---

## File map

| File                                                                                                                                                                       | Responsibility                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/async/map-with-concurrency.ts` (new)                                                                                                                              | Run an async fn over items with a concurrency cap.                           |
| `src/lib/supabase/queries/page-starts.ts` (new)                                                                                                                            | Pure: offsets of pages 2..n for a known total.                               |
| `src/lib/supabase/queries/cards.ts`                                                                                                                                        | `.order('id')` on paged reads; `fetchAllOwnerRows` (count + parallel pages). |
| `src/lib/collection/db/collection.ts`, `src/lib/wishlist/db/wishlist.ts`                                                                                                   | `fetchAllCollectionEntries` / `fetchAllWishlistEntries`.                     |
| `src/lib/collection/store/collection-store.ts`, `src/lib/wishlist/store/wishlist-store.ts`                                                                                 | Hydrate once, keep cache on error.                                           |
| `src/lib/scryfall/utils/card-cache.ts`                                                                                                                                     | `replaceCollectionCache`; new `card-facets` store (DB v5).                   |
| `src/lib/card/catalog-db/index.ts`                                                                                                                                         | `byPrintIds`.                                                                |
| `src/lib/card/catalog-db/uuid.ts` (new)                                                                                                                                    | `isUuid`.                                                                    |
| `src/lib/scryfall/resolveCardsByScryfallIds.ts`                                                                                                                            | Catalog-direct network step, proxy fallback for misses.                      |
| `supabase/migrations/20261003120000_card_facets.sql` (new), `supabase/verify_schema.sql`                                                                                   | RPC + audit.                                                                 |
| `src/types/cards.ts`                                                                                                                                                       | `CardFacets`, `IndexedCard`, `FacetCopy`, `FacetStack`.                      |
| `src/lib/collection-index/facets.ts` (new)                                                                                                                                 | Pure: `facetsFromCard`, `facetRowToFacets`, `oracleKeyOf`.                   |
| `src/lib/collection-index/fetch-card-facets.ts` (new)                                                                                                                      | RPC client.                                                                  |
| `src/lib/collection-index/load-facets.ts` (new)                                                                                                                            | Orchestrator: custom → RPC → resolver fallback.                              |
| `src/lib/collection-index/context/CollectionIndexProvider.tsx` (new)                                                                                                       | Global index state + IDB + status.                                           |
| `src/lib/card/utils/filterCollectionCards.ts`, `group-cards.ts`, `prefer-print.ts`, `src/app/[locale]/collection/lib/CollectionView/stats.ts`, `useCollectionFiltering.ts` | Generic over facets.                                                         |
| `src/lib/collection-index/page-window.ts` (new)                                                                                                                            | Pure: window ids, facet→full stacks, page readiness.                         |
| `src/lib/collection-index/hooks/usePagedCards.ts` (new)                                                                                                                    | Resolve window, gated `loadMore`.                                            |
| `src/lib/collection-index/collection-model.ts` (new)                                                                                                                       | `CollectionModel` type.                                                      |
| `src/lib/collection-index/hooks/useIndexedCollection.ts` (new)                                                                                                             | Owner/wishlist model.                                                        |
| `src/lib/collection-index/hooks/useStackCollectionModel.ts` (new)                                                                                                          | Public-page model (legacy full stacks).                                      |
| `src/lib/collection-index/load-card-copies.ts` (new)                                                                                                                       | Resolve every entry (exports, PDF).                                          |
| `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx`                                                                                                        | Render a `CollectionModel`.                                                  |
| `src/app/[locale]/collection/page.tsx`, `CollectionCardsContext.tsx` (delete), `ExportMenu/ExportMenu.tsx`                                                                 | Owner wiring, async export.                                                  |
| `src/app/[locale]/users/[userId]/collection/page.tsx`                                                                                                                      | Public page → `useStackCollectionModel`.                                     |
| `src/app/[locale]/wishlist/page.tsx`, `useWishlistPdf.ts`                                                                                                                  | Paged wishlist, async PDF.                                                   |
| `src/contexts/Providers.tsx`, `src/contexts/CardModalProvider.tsx`                                                                                                         | Mount index; on-demand stack resolution.                                     |
| Phase 2: `src/lib/collection/hooks/useCollectionOracleIds.ts`, `useCollectionBadge.ts`, `OwnershipBadge.tsx`, `DeckCardOverlay.tsx`, `DeckDetailOwnerView.tsx`             | Index-backed ownership + pending badge.                                      |
| `messages/en.json`, `messages/fr.json`                                                                                                                                     | New strings.                                                                 |

---

## Phase 1

### Task 0: Branch

- [ ] **Step 1:** `git switch -c feat/collection-index` — Expected: `Switched to a new branch 'feat/collection-index'` and `git status` still lists the unrelated modified files (they travel with the working tree, untouched).
- [ ] **Step 2: Baselines** — record `npx tsc --noEmit 2>&1 | grep -c 'error TS'` (tsc baseline) and, with `npm run dev`, the 9.7k-card user's **time to first card** on `/collection` cold (DevTools → Application → Clear site data, reload, Performance panel or a stopwatch) and warm (plain reload), plus the number of `/api/scryfall/cards/collection` requests. Keep the numbers for Task 13.

### Task 1: Entries pagination — stable order, parallel pages, hydrate once

**Files:**

- Create: `src/lib/supabase/queries/page-starts.ts`
- Modify: `src/lib/supabase/queries/cards.ts`, `src/lib/collection/db/collection.ts`, `src/lib/wishlist/db/wishlist.ts`, `src/lib/collection/store/collection-store.ts:94-128`, `src/lib/wishlist/store/wishlist-store.ts:48-59`, `src/lib/scryfall/utils/card-cache.ts`

**Interfaces:**

- Produces: `remainingPageStarts(total: number, pageSize: number): number[]`; `fetchAllOwnerRows(set: 'collection' | 'wishlist', userId: string): Promise<CardDbRow[]>` (throws on any page error); `fetchAllCollectionEntries(userId): Promise<Array<{ scryfallId: string; entry: CardEntry }>>`; `fetchAllWishlistEntries(userId)` (same shape); `replaceCollectionCache(entries: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>): Promise<void>`.

- [ ] **Step 1: Write the failing check** — `$SCRATCH/check-page-starts.ts`:

```ts
import { remainingPageStarts } from '@/lib/supabase/queries/page-starts';
const eq = (a: unknown, b: unknown, msg: string) => {
	if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)}`);
};
eq(remainingPageStarts(0, 1000), [], 'empty');
eq(remainingPageStarts(1000, 1000), [], 'exactly one page');
eq(remainingPageStarts(1001, 1000), [1000], 'one extra row');
eq(remainingPageStarts(9702, 1000), [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000], '9702');
console.log('OK page-starts');
```

- [ ] **Step 2: Run it** — `npx tsx --tsconfig tsconfig.json $SCRATCH/check-page-starts.ts` — Expected: FAIL, cannot find module `page-starts`.

- [ ] **Step 3: Implement** `src/lib/supabase/queries/page-starts.ts`:

```ts
/** Start offsets of every page AFTER the first one, for `total` rows. */
export function remainingPageStarts(total: number, pageSize: number): number[] {
	const starts: number[] = [];
	for (let from = pageSize; from < total; from += pageSize) starts.push(from);
	return starts;
}
```

- [ ] **Step 4: Run it** — Expected: `OK page-starts`.

- [ ] **Step 5: Stable order on the remaining paged reads** — in `src/lib/supabase/queries/cards.ts`, in `fetchCardRowsPage` and `fetchPublicWishlistCardRowsPage`, insert `.order('id')` immediately before `.range(...)`. (Without an ORDER BY, Postgres may return overlapping/missing rows across pages.)

- [ ] **Step 6: Replace `fetchWishlistCardRowsPage` with the whole-set loader** — delete `fetchWishlistCardRowsPage` from `cards.ts` and add:

```ts
import { remainingPageStarts } from './page-starts';

export const CARD_ROWS_PAGE_SIZE = 1000;

/** The signed-in owner's row sets that are always loaded whole. */
export type OwnerRowSet = 'collection' | 'wishlist';

async function fetchOwnerRowsRange(
	set: OwnerRowSet,
	userId: string,
	from: number,
	withCount: boolean
): Promise<{ rows: CardDbRow[]; count: number | null }> {
	const supabase = createClient();
	const base = supabase
		.from('card_entries')
		.select('*', withCount ? { count: 'exact' } : undefined);
	// A wishlist row is a standalone wishlist card (owner_id = userId) OR a deck card
	// flagged wishlist in place (owner_id null, deck_id set); RLS scopes the latter.
	const scoped =
		set === 'collection'
			? base.eq('owner_id', userId).eq('wishlist', false)
			: base.eq('wishlist', true).or(`owner_id.eq.${userId},deck_id.not.is.null`);
	const { data, error, count } = await scoped
		.order('id')
		.range(from, from + CARD_ROWS_PAGE_SIZE - 1);
	if (error) throw new Error(`[queries/cards] ${set} rows from ${from}: ${error.message}`);
	return { rows: (data ?? []) as CardDbRow[], count };
}

/**
 * Every row of the owner's collection or wishlist. The first page carries the exact
 * count, the remaining pages are fetched in parallel, then any rows inserted after the
 * count are picked up serially until a short page. Throws on any page error — a
 * partial set must never be mistaken for the whole collection.
 */
export async function fetchAllOwnerRows(set: OwnerRowSet, userId: string): Promise<CardDbRow[]> {
	const first = await fetchOwnerRowsRange(set, userId, 0, true);
	if (first.rows.length < CARD_ROWS_PAGE_SIZE) return first.rows;

	const starts = remainingPageStarts(first.count ?? 0, CARD_ROWS_PAGE_SIZE);
	const pages = await Promise.all(
		starts.map((from) => fetchOwnerRowsRange(set, userId, from, false))
	);
	const rows = [...first.rows, ...pages.flatMap((p) => p.rows)];

	let last = pages.at(-1) ?? first;
	let next = CARD_ROWS_PAGE_SIZE * (starts.length + 1);
	while (last.rows.length === CARD_ROWS_PAGE_SIZE) {
		last = await fetchOwnerRowsRange(set, userId, next, false);
		rows.push(...last.rows);
		next += CARD_ROWS_PAGE_SIZE;
	}
	return rows;
}
```

- [ ] **Step 7: Domain loaders** — in `src/lib/collection/db/collection.ts` replace `fetchCollectionPage` with:

```ts
export async function fetchAllCollectionEntries(
	userId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	return mapRows(await fetchAllOwnerRows('collection', userId));
}
```

(import `fetchAllOwnerRows` from `@/lib/supabase/queries/cards`; keep `fetchPublicCollectionPage` and `DB_FETCH_PAGE_SIZE` — the public page still uses them). In `src/lib/wishlist/db/wishlist.ts` replace `fetchWishlistPage` with:

```ts
export async function fetchAllWishlistEntries(
	userId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const rows = await fetchAllOwnerRows('wishlist', userId);
	return rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) }));
}
```

(keep `fetchPublicWishlistPage`; drop the now-unused `fetchWishlistCardRowsPage` import.)

- [ ] **Step 8: `replaceCollectionCache`** — append to `src/lib/scryfall/utils/card-cache.ts`:

```ts
/**
 * Replace the whole cached collection with `entries` in ONE transaction, so rows
 * deleted on another device do not linger in the cache forever.
 */
export async function replaceCollectionCache(
	entries: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>
): Promise<void> {
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(COLLECTION_STORE, 'readwrite');
				const store = tx.objectStore(COLLECTION_STORE);
				store.clear();
				for (const e of entries) {
					store.put({ rowId: e.rowId, scryfallId: e.scryfallId, entry: e.entry });
				}
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}
```

- [ ] **Step 9: Collection hydrate** — replace the body of `hydrateFromSupabase` in `collection-store.ts` (lines 94-128) with:

```ts
	hydrateFromSupabase: async (userId, triggerSync) => {
		// Purge ancien cache localStorage (migration one-time)
		if (typeof window !== 'undefined') {
			localStorage.removeItem('wizcard-collection');
		}

		// Phase 1: show the IndexedDB cache immediately
		const cached = await getCollectionFromCache();
		if (Object.keys(cached).length > 0) {
			set({ entries: cached, isLoaded: true });
		}

		// Phase 2: the whole collection from Supabase, published ONCE. Publishing page
		// by page replaced the cache with a partial set and restarted every
		// downstream resolution on each page.
		try {
			const rows = await fetchAllCollectionEntries(userId);
			const fresh: CollectionData = {};
			for (const copy of rows) fresh[copy.entry.rowId] = copy;
			set({ entries: fresh, isLoaded: true, isFullyLoaded: true });
			void replaceCollectionCache(
				rows.map((r) => ({ rowId: r.entry.rowId, scryfallId: r.scryfallId, entry: r.entry }))
			);
		} catch (err) {
			// Keep whatever the cache showed: a failed page must never truncate the
			// collection nor overwrite the cache with a partial set.
			console.error('[collection-store] hydrate failed:', err);
			set({ isLoaded: true, isFullyLoaded: true });
		}

		triggerSync();
	},
```

Update imports: `fetchAllCollectionEntries` instead of `fetchCollectionPage`; `replaceCollectionCache` instead of `putCollectionEntriesInCache` (keep `clearCollectionCache` — `handleLogout` uses it). Remove the import of `putCollectionEntriesInCache` only if nothing else in the file uses it (`grep -n putCollectionEntriesInCache src/lib/collection/store/collection-store.ts`).

- [ ] **Step 10: Wishlist hydrate** — replace `hydrateFromSupabase` in `wishlist-store.ts` (lines 48-59):

```ts
	hydrateFromSupabase: async (userId) => {
		try {
			const rows = await fetchAllWishlistEntries(userId);
			const fresh: WishlistData = {};
			for (const copy of rows) fresh[copy.entry.rowId] = copy;
			// Merge over current state (as before) so an optimistic add made while
			// loading is not dropped.
			set({ entries: { ...get().entries, ...fresh }, isLoaded: true });
		} catch (err) {
			console.error('[wishlist-store] hydrate failed:', err);
			set({ isLoaded: true });
		}
	},
```

Import `fetchAllWishlistEntries` instead of `fetchWishlistPage`.

- [ ] **Step 11: Check the loader against local data** — `$SCRATCH/check-owner-rows.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const owner = '8a21408f-2df5-4a34-8805-c744f3314752';
const { count } = await sb
	.from('card_entries')
	.select('*', { count: 'exact', head: true })
	.eq('owner_id', owner)
	.eq('wishlist', false);
const ids = new Set<string>();
for (let from = 0; from < (count ?? 0); from += 1000) {
	const { data, error } = await sb
		.from('card_entries')
		.select('id')
		.eq('owner_id', owner)
		.eq('wishlist', false)
		.order('id')
		.range(from, from + 999);
	if (error) throw error;
	for (const r of data) ids.add(r.id);
}
if (ids.size !== count) throw new Error(`ordered paging lost rows: ${ids.size} vs ${count}`);
console.log('OK ordered paging covers', count, 'rows with no duplicate');
```

Run with the service key if available (`grep -c SUPABASE_SERVICE_ROLE_KEY .env.local`); otherwise get it from `npx supabase status -o env` and pass `SUPABASE_SERVICE_ROLE_KEY=… npx tsx …`. Expected: `OK ordered paging covers 9702 rows with no duplicate`. (`fetchAllOwnerRows` itself needs a signed-in browser session; it is exercised in Task 13.)

- [ ] **Step 12: Static gates** — `npx tsc --noEmit 2>&1 | grep -E 'queries/(cards|page-starts)|collection/(db|store)|wishlist/(db|store)|card-cache'` → no output; `npx eslint` + `npx prettier --check` on the 7 files → clean. `grep -rn "fetchCollectionPage\|fetchWishlistPage(\|fetchWishlistCardRowsPage" src` → no output.

- [ ] **Step 13: Commit**

```bash
git add src/lib/supabase/queries/page-starts.ts src/lib/supabase/queries/cards.ts src/lib/collection/db/collection.ts src/lib/wishlist/db/wishlist.ts src/lib/collection/store/collection-store.ts src/lib/wishlist/store/wishlist-store.ts src/lib/scryfall/utils/card-cache.ts
git commit -m "fix(collection): stable paging order, parallel pages, hydrate once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Resolver reads the catalog directly

**Files:**

- Create: `src/lib/async/map-with-concurrency.ts`, `src/lib/card/catalog-db/uuid.ts`
- Modify: `src/lib/card/catalog-db/index.ts`, `src/lib/scryfall/resolveCardsByScryfallIds.ts:94-121`

**Interfaces:**

- Produces: `mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void>`; `isUuid(id: string): boolean`; `byPrintIds(ids: string[]): Promise<Map<string, Card>>` (never throws; failed chunks' ids are absent).
- `resolveCardsByScryfallIds` signature and return contract unchanged.

- [ ] **Step 1: Failing check** — `$SCRATCH/check-byprintids.ts`:

```ts
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency';
import { isUuid } from '@/lib/card/catalog-db/uuid';
import { byPrintIds } from '@/lib/card/catalog-db';
import { createClient } from '@supabase/supabase-js';

let inFlight = 0,
	peak = 0;
await mapWithConcurrency([...Array(20).keys()], 6, async () => {
	inFlight++;
	peak = Math.max(peak, inFlight);
	await new Promise((r) => setTimeout(r, 10));
	inFlight--;
});
if (peak !== 6) throw new Error(`peak ${peak}`);
if (isUuid('mpc:1234') || !isUuid('0000579f-7b35-4ed3-b44c-db2a538066fe'))
	throw new Error('isUuid');

const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const { data } = await sb.from('card_prints').select('id').limit(400);
const ids = (data ?? []).map((r) => r.id as string);
const t0 = Date.now();
const map = await byPrintIds([...ids, 'mpc:not-a-uuid', '00000000-0000-0000-0000-000000000000']);
if (map.size !== ids.length) throw new Error(`got ${map.size}/${ids.length}`);
const c = map.get(ids[0])!;
if (!c.name || !c.oracle_id || !c.set) throw new Error('not assembled');
console.log(`OK byPrintIds ${map.size} cards in ${Date.now() - t0}ms; invalid ids ignored`);
```

- [ ] **Step 2: Run** — `npx tsx --tsconfig tsconfig.json --env-file=.env.local $SCRATCH/check-byprintids.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement helpers**

`src/lib/async/map-with-concurrency.ts`:

```ts
/** Runs `fn` over `items` with at most `limit` calls in flight. `fn` must not throw. */
export async function mapWithConcurrency<T>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<void>
): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++];
			await fn(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
```

`src/lib/card/catalog-db/uuid.ts`:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a catalog print id. A single non-uuid in `.in('id', …)` or a uuid[]
 *  argument makes Postgres reject the whole request, so filter before querying. */
export function isUuid(id: string): boolean {
	return UUID_RE.test(id);
}
```

- [ ] **Step 4: `byPrintIds`** — append to `src/lib/card/catalog-db/index.ts` (after `byCollection`), importing `mapWithConcurrency` and `isUuid`:

```ts
// 150 ids keep the PostgREST URL well under the limit (300 already 414s); 6 chunks in
// flight decouple throughput from latency without hammering PostgREST.
const PRINT_ID_CHUNK = 150;
const PRINT_ID_CONCURRENCY = 6;

/**
 * Print ids → assembled Cards, straight from the catalog. Non-uuid ids are skipped,
 * a failed chunk is logged and its ids are simply absent: the caller's fallback
 * picks up whatever is missing. Never throws.
 */
export async function byPrintIds(ids: string[]): Promise<Map<string, Card>> {
	const sb = createCatalogClient();
	const unique = [...new Set(ids)].filter(isUuid);
	const chunks: string[][] = [];
	for (let i = 0; i < unique.length; i += PRINT_ID_CHUNK) {
		chunks.push(unique.slice(i, i + PRINT_ID_CHUNK));
	}
	const out = new Map<string, Card>();
	await mapWithConcurrency(chunks, PRINT_ID_CONCURRENCY, async (chunk) => {
		try {
			const { data, error } = await sb.from('card_prints').select(PRINT_COLS).in('id', chunk);
			if (error) throw error;
			for (const card of await assemblePrints(sb, (data ?? []) as PrintRow[])) {
				out.set(card.id, card);
			}
		} catch (err) {
			console.error('[catalog-db] byPrintIds chunk failed:', err);
		}
	});
	return out;
}
```

- [ ] **Step 5: Run the check** — Expected: `OK byPrintIds 400 cards in <N>ms; invalid ids ignored`.

- [ ] **Step 6: Wire into the resolver** — in `resolveCardsByScryfallIds.ts`, import `byPrintIds` from `@/lib/card/catalog-db`, and replace the block from `const chunks: string[][] = [];` through the end of the `for` loop (lines 94-117) with:

```ts
// 1. Straight from the DB catalog: chunked + parallel, no proxy, no Scryfall throttle.
const fetched: Card[] = [];
if (isCancelled?.()) return resolved;
const fromCatalog = await byPrintIds(missIds);
for (const card of fromCatalog.values()) {
	fetched.push(card);
	resolved.set(card.id, card);
}

// 2. Whatever the catalog lacks (lagging seed, failed chunk) → proxy → Scryfall.
const fallbackIds = missIds.filter((id) => !fromCatalog.has(id));
const chunks: string[][] = [];
for (let i = 0; i < fallbackIds.length; i += BATCH_SIZE) {
	chunks.push(fallbackIds.slice(i, i + BATCH_SIZE));
}
for (let i = 0; i < chunks.length; i++) {
	if (isCancelled?.()) return resolved;
	try {
		const result = await getCardCollection(chunks[i].map((id) => ({ id })));
		for (const card of result.data) {
			fetched.push(card);
			resolved.set(card.id, card);
		}
	} catch (err) {
		console.error(`[resolveCardsByScryfallIds] batch ${i + 1}/${chunks.length} failed:`, err);
	}
	onProgress?.({ current: i + 1, total: chunks.length });
}
```

Keep the cache write + `putCards(fetched)` tail unchanged. Update the JSDoc pipeline line to: "dedupe ids → read IndexedDB cache → read the DB catalog directly (chunked, parallel) → batch-fetch the remaining misses through the proxy in `BATCH_SIZE` chunks → write fetched cards back to cache." Note `onProgress` now counts fallback batches only (its sole caller, the importer, only uses it for a progress bar; check with `grep -rn "onProgress" src --include=*.ts*` and confirm nothing depends on the old total).

- [ ] **Step 7: Resolver check** — `$SCRATCH/check-resolver.ts`:

```ts
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const { data } = await sb.from('card_prints').select('id').limit(300);
const ids = (data ?? []).map((r) => r.id as string);
const t0 = Date.now();
const map = await resolveCardsByScryfallIds(ids, { skipCache: true });
if (map.size !== ids.length) throw new Error(`${map.size}/${ids.length}`);
console.log(`OK resolver ${map.size} from catalog in ${Date.now() - t0}ms`);
```

Expected: `OK resolver 300 from catalog in <N>ms` with no Scryfall network call (no `[resolveCardsByScryfallIds] batch` log).

- [ ] **Step 8: Static gates** on the 4 files, then **commit**:

```bash
git add src/lib/async/map-with-concurrency.ts src/lib/card/catalog-db/uuid.ts src/lib/card/catalog-db/index.ts src/lib/scryfall/resolveCardsByScryfallIds.ts
git commit -m "perf(cards): resolve prints from the DB catalog directly, proxy only for misses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `card_facets` RPC

**Files:**

- Create: `supabase/migrations/20261003120000_card_facets.sql`
- Modify: `supabase/verify_schema.sql` (function list near line 373)

**Interfaces:**

- Produces: `public.card_facets(p_ids uuid[]) returns table(id uuid, oracle_id uuid, name text, lang text, layout text, "set" text, collector_number text, rarity text, released_at date, artist text, promo boolean, digital boolean, cmc numeric, colors text[], color_identity text[], type_line text, oracle_text text, power text, toughness text, edhrec_rank integer)` — one row per found id.

- [ ] **Step 1: Failing check** — `docker exec $(docker ps --format '{{.Names}}' | grep -m1 supabase_db) psql -U postgres -c "select count(*) from public.card_facets(array(select id from card_prints limit 5));"` — Expected: `ERROR: function public.card_facets(uuid[]) does not exist`.

- [ ] **Step 2: Migration** `supabase/migrations/20261003120000_card_facets.sql`:

```sql
-- Facettes légères d'un lot de prints, pour l'index de collection côté client
-- (tri, filtres, regroupement par oracle_id) sans charger les cartes complètes.
--
-- Lit uniquement le catalogue public (card_prints + card_definitions, RLS
-- « select using (true) ») : security invoker suffit, aucune donnée utilisateur.
-- Appelée en POST par PostgREST (/rpc/card_facets), donc aucune limite d'URL
-- quelle que soit la taille de la collection.
--
-- Les colonnes reproduisent exactement ce que rowsToCard (catalog-db/assembler)
-- met dans une Card : nom/type/texte/couleurs de la définition, set/rareté/
-- artiste/date du print. Un id absent du catalogue ne renvoie simplement pas de
-- ligne ; le client le résout alors via Scryfall.
--
-- Idempotent : create or replace + grant.
create or replace function public.card_facets(p_ids uuid[])
returns table (
  id uuid,
  oracle_id uuid,
  name text,
  lang text,
  layout text,
  "set" text,
  collector_number text,
  rarity text,
  released_at date,
  artist text,
  promo boolean,
  digital boolean,
  cmc numeric,
  colors text[],
  color_identity text[],
  type_line text,
  oracle_text text,
  power text,
  toughness text,
  edhrec_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.oracle_id, d.name, p.lang, d.layout, p.set, p.collector_number,
         p.rarity, p.released_at, p.artist, p.promo, p.digital,
         d.cmc, d.colors, d.color_identity, d.type_line, d.oracle_text,
         d.power, d.toughness, d.edhrec_rank
  from public.card_prints p
  join public.card_definitions d on d.oracle_id = p.oracle_id
  where p.id = any(p_ids);
$$;

grant execute on function public.card_facets(uuid[]) to anon, authenticated;
```

- [ ] **Step 3: Apply** — `npm run sb:migrate`. Expected: the migration is listed as applied.

- [ ] **Step 4: Verify behaviour + plan** —

```bash
DB=$(docker ps --format '{{.Names}}' | grep -m1 supabase_db)
docker exec $DB psql -U postgres -c "select count(*) from public.card_facets(array(select id from card_prints limit 5) || '00000000-0000-0000-0000-000000000000'::uuid);"
docker exec $DB psql -U postgres -c "set role anon; select name, \"set\", cmc from public.card_facets(array(select id from card_prints limit 1));"
docker exec $DB psql -U postgres -c "\timing on" -c "select count(*) from public.card_facets(array(select distinct scryfall_id::uuid from card_entries where owner_id='8a21408f-2df5-4a34-8805-c744f3314752' and scryfall_id ~ '^[0-9a-f-]{36}\$'));"
```

Expected: `5` (unknown id → no row); one row as `anon`; count ≈ 5 3xx in well under a second.

- [ ] **Step 5: Audit** — in `supabase/verify_schema.sql`, add `('card_facets','p_ids uuid[]'),` to the function list (next to `('count_distinct_public_cards','owner uuid'),`). Run `npm run sb:verify` — Expected: no FAIL, one more PASS than before.

Note: `supabase/bootstrap/init_schema.sql` does **not** contain the catalog tables at all (it predates them), so the function is deliberately not added there — it would fail to create on a blank DB. Say so in the commit body.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003120000_card_facets.sql supabase/verify_schema.sql
git commit -m "feat(db): card_facets RPC for the collection index

Not mirrored in bootstrap/init_schema.sql: that file has no catalog tables.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Facet types, mapping, RPC client

**Files:**

- Modify: `src/types/cards.ts` (append after `CardStack`)
- Create: `src/lib/collection-index/facets.ts`, `src/lib/collection-index/fetch-card-facets.ts`

**Interfaces:**

- Produces (types in `@/types/cards`):

```ts
export type CardFacets = Pick<
	Card,
	| 'id'
	| 'oracle_id'
	| 'name'
	| 'lang'
	| 'layout'
	| 'set'
	| 'collector_number'
	| 'rarity'
	| 'released_at'
	| 'artist'
	| 'promo'
	| 'digital'
	| 'cmc'
	| 'colors'
	| 'color_identity'
	| 'type_line'
	| 'oracle_text'
	| 'power'
	| 'toughness'
	| 'edhrec_rank'
>;
/** What the index holds per print: facets for catalog/Scryfall prints, the full
 *  (already light, local) CustomCard for `mpc:` prints — filters read `custom.*`. */
export type IndexedCard = CardFacets | CustomCard;
export type FacetCopy = IndexedCard & { entry: CardEntry };
export interface FacetStack {
	oracleId: string;
	name: string;
	cards: FacetCopy[];
}
```

- Produces (functions): `facetsFromCard(card: Card): CardFacets`; `facetRowToFacets(row: CardFacetsRow): CardFacets`; `oracleKeyOf(card: { oracle_id?: string; id: string }): string`; `fetchCardFacets(ids: string[]): Promise<Map<string, CardFacets>>` (throws on RPC error; non-uuids skipped).

- [ ] **Step 1: Failing check** — `$SCRATCH/check-facets.ts`:

```ts
import { facetsFromCard, facetRowToFacets } from '@/lib/collection-index/facets';
import { fetchCardFacets } from '@/lib/collection-index/fetch-card-facets';
import { byPrintIds } from '@/lib/card/catalog-db';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const { data } = await sb.from('card_prints').select('id').limit(200);
const ids = (data ?? []).map((r) => r.id as string);
const facets = await fetchCardFacets([...ids, 'mpc:abc']);
const cards = await byPrintIds(ids);
if (facets.size !== ids.length) throw new Error(`facets ${facets.size}`);
// Parity: RPC facets === facets derived from the assembled Card.
for (const id of ids) {
	const a = JSON.stringify(facets.get(id));
	const b = JSON.stringify(facetsFromCard(cards.get(id)!));
	if (a !== b) throw new Error(`parity ${id}\nrpc ${a}\ncard ${b}`);
}
const r = facetRowToFacets({
	id: 'x',
	oracle_id: 'o',
	name: 'N',
	lang: 'en',
	layout: null,
	set: 's',
	collector_number: '1',
	rarity: null,
	released_at: null,
	artist: null,
	promo: null,
	digital: null,
	cmc: null,
	colors: null,
	color_identity: null,
	type_line: null,
	oracle_text: null,
	power: null,
	toughness: null,
	edhrec_rank: null,
});
if (r.layout !== 'normal' || ('rarity' in r && r.rarity !== undefined))
	throw new Error('null mapping');
console.log('OK facets parity on', ids.length, 'prints');
```

- [ ] **Step 2: Run** — Expected: FAIL (modules missing).

- [ ] **Step 3: Types** — append the block above to `src/types/cards.ts` (it already imports `CustomCard`). Stage later with `git add -p` (unrelated hunks exist in this file).

- [ ] **Step 4: `src/lib/collection-index/facets.ts`**

```ts
import type { Card, CardFacets, MtgColor } from '@/types/cards';

/** Row shape returned by the `card_facets` RPC. */
export interface CardFacetsRow {
	id: string;
	oracle_id: string;
	name: string;
	lang: string;
	layout: string | null;
	set: string;
	collector_number: string;
	rarity: string | null;
	released_at: string | null;
	artist: string | null;
	promo: boolean | null;
	digital: boolean | null;
	cmc: number | null;
	colors: string[] | null;
	color_identity: string[] | null;
	type_line: string | null;
	oracle_text: string | null;
	power: string | null;
	toughness: string | null;
	edhrec_rank: number | null;
}

/** Logical-card key: oracle_id when known, else the print id (custom cards). */
export function oracleKeyOf(card: { oracle_id?: string; id: string }): string {
	return card.oracle_id ?? card.id;
}

/** Facets of an assembled Card. Field order is fixed so JSON comparisons are stable. */
export function facetsFromCard(card: Card): CardFacets {
	return {
		id: card.id,
		oracle_id: card.oracle_id,
		name: card.name,
		lang: card.lang,
		layout: card.layout,
		set: card.set,
		collector_number: card.collector_number,
		rarity: card.rarity,
		released_at: card.released_at,
		artist: card.artist,
		promo: card.promo,
		digital: card.digital,
		cmc: card.cmc,
		colors: card.colors,
		color_identity: card.color_identity,
		type_line: card.type_line,
		oracle_text: card.oracle_text,
		power: card.power,
		toughness: card.toughness,
		edhrec_rank: card.edhrec_rank,
	};
}

/** RPC row → facets, mapping NULL → undefined exactly like rowsToCard does. */
export function facetRowToFacets(row: CardFacetsRow): CardFacets {
	return {
		id: row.id,
		oracle_id: row.oracle_id,
		name: row.name,
		lang: row.lang,
		layout: row.layout ?? 'normal',
		set: row.set,
		collector_number: row.collector_number,
		rarity: row.rarity ?? undefined,
		released_at: row.released_at ?? undefined,
		artist: row.artist ?? undefined,
		promo: row.promo ?? undefined,
		digital: row.digital ?? undefined,
		cmc: row.cmc ?? undefined,
		colors: (row.colors as MtgColor[] | null) ?? undefined,
		color_identity: (row.color_identity as MtgColor[] | null) ?? undefined,
		type_line: row.type_line ?? undefined,
		oracle_text: row.oracle_text ?? undefined,
		power: row.power ?? undefined,
		toughness: row.toughness ?? undefined,
		edhrec_rank: row.edhrec_rank ?? undefined,
	};
}
```

If the parity check later shows a difference for a field (e.g. `cmc` arriving as a string), fix the mapping here — `facetsFromCard` is the reference.

- [ ] **Step 5: `src/lib/collection-index/fetch-card-facets.ts`**

```ts
import { createCatalogClient } from '@/lib/supabase/catalog';
import { isUuid } from '@/lib/card/catalog-db/uuid';
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency';
import type { CardFacets } from '@/types/cards';
import { facetRowToFacets, type CardFacetsRow } from './facets';

// POST body, so no URL limit; the chunk only bounds a single response's size.
const FACETS_CHUNK = 2000;
const FACETS_CONCURRENCY = 3;

/**
 * Facets for print ids from the `card_facets` RPC. Non-uuid ids are skipped (one
 * would make Postgres reject the whole uuid[] argument); ids absent from the
 * catalog are simply missing from the result. Throws if any call fails, so the
 * caller can tell "not in catalog" from "could not ask".
 */
export async function fetchCardFacets(ids: string[]): Promise<Map<string, CardFacets>> {
	const sb = createCatalogClient();
	const valid = [...new Set(ids)].filter(isUuid);
	const chunks: string[][] = [];
	for (let i = 0; i < valid.length; i += FACETS_CHUNK)
		chunks.push(valid.slice(i, i + FACETS_CHUNK));

	const out = new Map<string, CardFacets>();
	let failure: unknown = null;
	await mapWithConcurrency(chunks, FACETS_CONCURRENCY, async (chunk) => {
		const { data, error } = await sb.rpc('card_facets', { p_ids: chunk });
		if (error) {
			failure = error;
			return;
		}
		for (const row of (data ?? []) as CardFacetsRow[]) out.set(row.id, facetRowToFacets(row));
	});
	if (failure)
		throw new Error(`[card_facets] RPC failed: ${String((failure as Error).message ?? failure)}`);
	return out;
}
```

- [ ] **Step 6: Run the check** — Expected: `OK facets parity on 200 prints`.

- [ ] **Step 7: Static gates + commit**

```bash
git add -p src/types/cards.ts   # take ONLY the CardFacets/IndexedCard/FacetCopy/FacetStack hunk
git add src/lib/collection-index/facets.ts src/lib/collection-index/fetch-card-facets.ts
git commit -m "feat(collection-index): CardFacets type, RPC client, Card↔facets parity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Facets IDB store

**Files:** Modify `src/lib/scryfall/utils/card-cache.ts`

**Interfaces:**

- Produces: `getFacetsFromCache(ids: string[]): Promise<Map<string, { facets: CardFacets; stale: boolean }>>`; `putFacetsInCache(facets: CardFacets[]): Promise<void>`; `clearFacetsCache(): Promise<void>`.

- [ ] **Step 1: Store + version** — bump `DB_VERSION` to `5`, add `const FACETS_STORE = 'card-facets';` and `const FACETS_TTL_MS = 30 * 86_400_000; // 30 days — a print's facets almost never change`, and in `onupgradeneeded`:

```ts
if (!db.objectStoreNames.contains(FACETS_STORE)) {
	db.createObjectStore(FACETS_STORE, { keyPath: 'id' });
}
```

Update the `DB_VERSION` comment: "v5: card-facets store (collection index)".

- [ ] **Step 2: Accessors** — append:

```ts
interface CachedFacets {
	id: string; // keyPath
	facets: CardFacets;
	cachedAt: number;
}

/**
 * Cached facets for `ids`. Entries past the TTL are still returned, flagged
 * `stale`, so the index can render immediately and refresh them in background.
 */
export async function getFacetsFromCache(
	ids: string[]
): Promise<Map<string, { facets: CardFacets; stale: boolean }>> {
	const result = new Map<string, { facets: CardFacets; stale: boolean }>();
	if (ids.length === 0) return result;
	try {
		const db = await openDB();
		return new Promise((resolve) => {
			try {
				const store = db.transaction(FACETS_STORE, 'readonly').objectStore(FACETS_STORE);
				const cutoff = Date.now() - FACETS_TTL_MS;
				let pending = ids.length;
				const done = () => {
					pending--;
					if (pending === 0) resolve(result);
				};
				for (const id of ids) {
					const req = store.get(id);
					req.onsuccess = () => {
						const row = req.result as CachedFacets | undefined;
						if (row) result.set(id, { facets: row.facets, stale: row.cachedAt < cutoff });
						done();
					};
					req.onerror = done;
				}
			} catch {
				resolve(result);
			}
		});
	} catch {
		return result;
	}
}

export async function putFacetsInCache(facets: CardFacets[]): Promise<void> {
	if (facets.length === 0) return;
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(FACETS_STORE, 'readwrite');
				const store = tx.objectStore(FACETS_STORE);
				const now = Date.now();
				for (const f of facets)
					store.put({ id: f.id, facets: f, cachedAt: now } satisfies CachedFacets);
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}

/** Logout / account switch: the list of ids reveals what the previous user owns. */
export async function clearFacetsCache(): Promise<void> {
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(FACETS_STORE, 'readwrite');
				tx.objectStore(FACETS_STORE).clear();
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}
```

Import `CardFacets` from `@/types/cards`.

- [ ] **Step 3: Clear on logout** — in `collection-store.ts` `handleLogout`, next to `void clearCollectionCache();` add `void clearFacetsCache();` (import it). Do **not** add it to the "Supabase returned an empty collection" path (the facets are not user data; the wishlist may still need them).

- [ ] **Step 4: Static gates** (IDB is browser-only; behaviour is exercised in Task 13: Application → IndexedDB → `wizcard-cache` v5 shows `card-facets`). **Commit**:

```bash
git add src/lib/scryfall/utils/card-cache.ts src/lib/collection/store/collection-store.ts
git commit -m "feat(cache): card-facets IDB store (30-day TTL), cleared on logout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: `loadFacets` orchestrator

**Files:** Create `src/lib/collection-index/load-facets.ts`

**Interfaces:**

- Consumes: `fetchCardFacets`, `facetsFromCard`, `getCustomCardsByIds`, `resolveCardsByScryfallIds`, `isUuid`.
- Produces:

```ts
export interface LoadFacetsResult {
	found: Map<string, IndexedCard>;
	/** Ids absent from the catalog AND from Scryfall: excluded, never retried. */
	notFound: string[];
}
/** Throws only when the catalog could not be asked AND the fallback did not cover the ids. */
export async function loadFacets(
	ids: string[],
	opts?: { isCancelled?: () => boolean }
): Promise<LoadFacetsResult>;
```

- [ ] **Step 1: Failing check** — `$SCRATCH/check-load-facets.ts`:

```ts
import { loadFacets } from '@/lib/collection-index/load-facets';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
const { data: inCat } = await sb.from('card_prints').select('id').limit(50);
const ids = (inCat ?? []).map((r) => r.id as string);
const bogus = '00000000-0000-4000-8000-000000000000'; // in no catalog, 404 on Scryfall
const res = await loadFacets([...ids, bogus]);
if (res.found.size !== ids.length) throw new Error(`found ${res.found.size}`);
if (res.notFound.length !== 1 || res.notFound[0] !== bogus)
	throw new Error(`notFound ${res.notFound}`);
console.log('OK loadFacets: catalog hits + one not-found, no throw');
```

- [ ] **Step 2: Run** — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { getCustomCardsByIds } from '@/lib/mpc/db/custom-cards';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { isUuid } from '@/lib/card/catalog-db/uuid';
import { isCustomCard } from '@/lib/mpc/types';
import type { IndexedCard } from '@/types/cards';
import { fetchCardFacets } from './fetch-card-facets';
import { facetsFromCard } from './facets';

export interface LoadFacetsResult {
	found: Map<string, IndexedCard>;
	notFound: string[];
}

/**
 * Facts the index needs for `ids`:
 *   mpc: ids        → custom_cards (full CustomCard, light and local)
 *   catalog prints  → card_facets RPC
 *   the rest        → resolveCardsByScryfallIds (catalog lag → Scryfall), facets
 *                     derived from the returned Card (which also lands in the cache)
 * An id nobody knows is reported in `notFound`. If the RPC itself failed and the
 * fallback could not cover its ids either, this throws: the index must not claim
 * `ready` with silent holes.
 */
export async function loadFacets(
	ids: string[],
	opts: { isCancelled?: () => boolean } = {}
): Promise<LoadFacetsResult> {
	const found = new Map<string, IndexedCard>();
	const unique = [...new Set(ids)];
	const customIds = unique.filter((id) => id.startsWith('mpc:'));
	const printIds = unique.filter((id) => !id.startsWith('mpc:'));

	if (customIds.length > 0) {
		try {
			for (const [id, card] of await getCustomCardsByIds(customIds)) found.set(id, card);
		} catch (err) {
			console.error('[loadFacets] custom cards failed:', err);
		}
	}
	if (opts.isCancelled?.()) return { found, notFound: [] };

	let rpcFailed = false;
	try {
		for (const [id, facets] of await fetchCardFacets(printIds)) found.set(id, facets);
	} catch (err) {
		rpcFailed = true;
		console.error('[loadFacets] card_facets failed, falling back:', err);
	}
	if (opts.isCancelled?.()) return { found, notFound: [] };

	// Non-uuid ids can't be in the catalog nor on Scryfall by id: not found.
	const malformed = printIds.filter((id) => !isUuid(id));
	const misses = printIds.filter((id) => isUuid(id) && !found.has(id));
	if (misses.length > 0) {
		const resolved = await resolveCardsByScryfallIds(misses, { isCancelled: opts.isCancelled });
		for (const [id, card] of resolved) {
			found.set(id, isCustomCard(card) ? card : facetsFromCard(card));
		}
	}
	const notFound = [...malformed, ...misses.filter((id) => !found.has(id))];
	if (rpcFailed && notFound.length > 0) {
		throw new Error(`[loadFacets] ${notFound.length} prints unresolved after card_facets failure`);
	}
	if (notFound.length > 0) {
		console.warn(`[loadFacets] ${notFound.length} prints found nowhere — excluded`, notFound);
	}
	return { found, notFound };
}
```

- [ ] **Step 4: Run the check** — Expected: `OK loadFacets: catalog hits + one not-found, no throw` (a warn line for the bogus id is expected).

- [ ] **Step 5: Static gates + commit**

```bash
git add src/lib/collection-index/load-facets.ts
git commit -m "feat(collection-index): loadFacets — custom, RPC, Scryfall fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `CollectionIndexProvider` (global)

**Files:**

- Create: `src/lib/collection-index/context/CollectionIndexProvider.tsx`
- Modify: `src/contexts/Providers.tsx:38-50`

**Interfaces:**

- Consumes: `useCollectionContext().entries`, `useWishlistContext().entries`, `loadFacets`, `getFacetsFromCache`, `putFacetsInCache`, `oracleKeyOf`.
- Produces:

```ts
export type CollectionIndexStatus = 'loading' | 'ready' | 'error';
export interface CollectionIndex {
	status: CollectionIndexStatus;
	error: Error | null;
	/** Stable per facets version — safe as a memo dependency. */
	getFacets: (scryfallId: string) => IndexedCard | undefined;
	/** scryfallIds of collection ∪ wishlist entries sharing this oracle key. */
	printsForOracle: (oracleKey: string) => string[];
	retry: () => void;
}
export function CollectionIndexProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useCollectionIndex(): CollectionIndex;
```

- [ ] **Step 1: Implement**

```tsx
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
			for (const id of pending) if (!facets.has(id)) settledRef.current.delete(id);
		};
		// `facets` is read only in the cleanup, to keep finished ids settled.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ids, entriesReady, attempt]);

	const status: CollectionIndexStatus = error
		? 'error'
		: entriesReady && (ids.length === 0 || completedOnce)
			? 'ready'
			: 'loading';

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
```

Notes for the implementer:

- Facets are public catalog data, so the in-memory map is not wiped on logout (only the IDB store is, in Task 5, because it reveals which prints the user owns). Every consumer reads by the _current_ entries' ids, so leftover facets are invisible.
- If eslint flags `facets` in the cleanup as a stale closure, replace that line with a `facetsRef` mirrored in a `useEffect(() => { facetsRef.current = facets; }, [facets])` and read `facetsRef.current` in the cleanup.
- If `oracleKeyOf(f)` does not type-check for `CustomCard` (its `oracle_id` comes from `Partial<ScryfallCard>`), widen `oracleKeyOf`'s parameter to `{ oracle_id?: string | null; id: string }` and use `card.oracle_id ?? card.id`.

- [ ] **Step 2: Mount** — in `src/contexts/Providers.tsx`, wrap the `<DeckProvider>` subtree:

```tsx
<WishlistProvider>
	<CollectionIndexProvider>
		<DeckProvider>…unchanged…</DeckProvider>
	</CollectionIndexProvider>
</WishlistProvider>
```

(import `CollectionIndexProvider` from `@/lib/collection-index/context/CollectionIndexProvider`). It sits inside both entry providers (it reads them) and outside `CardModalProvider` (which will read it).

- [ ] **Step 3: Static gates** on both files.

- [ ] **Step 4: Runtime smoke** — `npm run dev`, sign in as the 9.7k-card user, open `/search` (not the collection). In DevTools → Network filter `rpc/card_facets`: Expected 3 POSTs (5 3xx ids / 2000) the first time; reload → 0 POSTs (all from IDB). Application → IndexedDB → `wizcard-cache` → `card-facets` holds ≈ 5.4k rows. Console: no error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/collection-index/context/CollectionIndexProvider.tsx src/contexts/Providers.tsx
git commit -m "feat(collection-index): global CollectionIndexProvider with IDB + status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Filter / group / stats generic over facets

**Files:** Modify `src/lib/card/utils/filterCollectionCards.ts`, `src/lib/card/utils/group-cards.ts`, `src/app/[locale]/collection/lib/CollectionView/stats.ts`, `src/app/[locale]/collection/lib/CollectionView/useCollectionFiltering.ts`

**Interfaces:**

- Produces: `filterCollectionCards<T extends FilterableCard>(cards: T[], filters): T[]`; `getSortValue(card: FilterableCard, order): string | number`; `groupByOracleId<T extends FacetCopy>(cards: T[]): Array<{ oracleId: string; name: string; cards: T[] }>`; `filterStacks<T extends FacetCopy>(stacks: Array<{ oracleId: string; name: string; cards: T[] }>, filters): same`; `computeCollectionStats(stacks: Array<{ cards: Array<{ set?: string; rarity?: string }> }>): CollectionStats`. `CardStack`/`CardCopy` callers keep compiling (both satisfy the bounds).

- [ ] **Step 1: Failing check** — `$SCRATCH/check-generic-filter.ts`:

```ts
import { filterStacks, groupByOracleId } from '@/lib/card/utils/group-cards';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';
import type { FacetCopy } from '@/types/cards';
const mk = (id: string, oracle: string, name: string, extra: Partial<FacetCopy> = {}): FacetCopy =>
	({
		id,
		oracle_id: oracle,
		name,
		lang: 'en',
		layout: 'normal',
		set: 'abc',
		collector_number: '1',
		entry: { rowId: id, dateAdded: '2026-01-01' },
		...extra,
	}) as FacetCopy;
const stacks = groupByOracleId([
	mk('1', 'o1', 'Zebra'),
	mk('2', 'o2', 'Ant', { colors: ['G'] }),
	mk('3', 'o1', 'Zebra', { promo: true }),
]);
const sorted = filterStacks(stacks, defaultCollectionFilters);
if (sorted.map((s) => s.name).join() !== 'Ant,Zebra') throw new Error('sort');
if (sorted[1].cards[0].id !== '1') throw new Error('preferPrint: non-promo must lead');
const green = filterStacks(stacks, { ...defaultCollectionFilters, colors: ['G'] });
if (green.length !== 1 || green[0].name !== 'Ant') throw new Error('color filter');
console.log('OK filters/grouping run on facets');
```

- [ ] **Step 2: Run** — `tsx` strips types, so this prints `OK` already: it pins **behaviour**, which must not change. The failing signal for this task is the type check: add `const _typed: FacetCopy[] = []; groupByOracleId(_typed);` to a scratch file under `src/` (e.g. `src/__facet_check.ts`, deleted in Step 7) and run `npx tsc --noEmit 2>&1 | grep __facet_check` — Expected: an error (`FacetCopy` not assignable to `CardCopy`).

- [ ] **Step 3: `filterCollectionCards.ts`** — replace the local alias and casts:

```ts
import type { Card, CardEntry, CardFacets, MtgColor } from '@/types/cards';

/** Anything the collection filters can read: facets, full Cards, custom cards, ± entry. */
type BaseCard = CardFacets | CustomCard;
export type FilterableCard = BaseCard | (BaseCard & { entry: CardEntry });
type AnyCard = FilterableCard;
type WithEntry = BaseCard & { entry: CardEntry };
```

Then mechanically: every `(card as Card).x` → `(card as CardFacets).x`; `(card as CardCopy)` → `(card as WithEntry)`; `card: CardCopy` params (`matchesProxyFilter`, `matchesFoilFilter`) → `card: WithEntry`; `matchesOracleText(card: Card, …)` → `card: CardFacets`; `isCustomCard(card as Card | CustomCard)` stays valid if `isCustomCard` accepts `CardFacets` — change its signature in `src/lib/mpc/types.ts` to `isCustomCard(card: CardFacets | Card | CustomCard): card is CustomCard` (body unchanged: `'custom' in card`). `getSortValue(card: FilterableCard, order)`; prices/penny keep their narrow reads: `(card as Partial<Pick<Card, 'prices'>>).prices?.usd` and `(card as ScryfallOnlyFields).penny_rank` (cast through `unknown` if TS demands). `filterCollectionCards<T extends FilterableCard>` and its sort call `getSortValue(a, filters.order)` without casts. Remove the now-unused `CardCopy` import.

- [ ] **Step 4: `group-cards.ts`** —

```ts
import type { FacetCopy } from '@/types/cards';

type StackOf<T> = { oracleId: string; name: string; cards: T[] };

export function cardGroupKey(card: { oracle_id?: string; id: string }): string {
	return card.oracle_id ?? card.id;
}

export function groupByOracleId<T extends FacetCopy>(cards: T[]): StackOf<T>[] {
	/* body unchanged */
}
function matchesDeckAssignment(
	card: FacetCopy,
	deckAssignment: CollectionFilters['deckAssignment']
): boolean {
	/* unchanged */
}
export function filterStacks<T extends FacetCopy>(
	stacks: StackOf<T>[],
	filters: CollectionFilters
): StackOf<T>[] {
	/* body unchanged except: `.filter((s): s is StackOf<T> => Boolean(s))` */
}
```

`preferPrint<T extends PrintLike>` already accepts facets (`digital/promo/released_at` are on `CardFacets`; `set_type` stays optional). Check every importer still compiles: `grep -rn "groupByOracleId\|filterStacks\|cardGroupKey" src`.

- [ ] **Step 5: `stats.ts`** — change the signature only:

```ts
export function computeCollectionStats(
	stacks: Array<{ cards: Array<{ set?: string; rarity?: string }> }>
): CollectionStats {
```

- [ ] **Step 6: `useCollectionFiltering.ts`** — make it generic so the public page keeps using it:

```ts
export function useCollectionFiltering<S extends { oracleId: string; name: string; cards: FacetCopy[] }>(stacks: S[]) {
	…
	const filteredStacks = useMemo(() => filterStacks(stacks, filters) as S[], [stacks, filters]);
```

(If the cast is needed because `filterStacks` returns `StackOf<T>[]`, keep it — `filterStacks` only ever returns members of `stacks` or `{ ...stack, cards }` copies of them.)

- [ ] **Step 7: Run check** → `OK filters/grouping run on facets`; `npx tsc --noEmit 2>&1 | grep __facet_check` → no output, then delete `src/__facet_check.ts`; `npx tsc --noEmit 2>&1 | grep -E 'filterCollectionCards|group-cards|stats|useCollectionFiltering|mpc/types|ImportModal|import/'` → no output.

- [ ] **Step 8: Commit**

```bash
git add src/lib/card/utils/filterCollectionCards.ts src/lib/card/utils/group-cards.ts src/lib/mpc/types.ts "src/app/[locale]/collection/lib/CollectionView/stats.ts" "src/app/[locale]/collection/lib/CollectionView/useCollectionFiltering.ts"
git commit -m "refactor(cards): collection filters/grouping/stats generic over CardFacets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Page window + `usePagedCards`

**Files:** Create `src/lib/collection-index/page-window.ts`, `src/lib/collection-index/hooks/usePagedCards.ts`

**Interfaces:**

- Produces (pure):

```ts
export function windowIds(stacks: FacetStack[], end: number): string[]; // unique scryfallIds of all copies of stacks[0..end)
export function toCardStack(
	stack: FacetStack,
	cards: ReadonlyMap<string, Card | CustomCard>
): CardStack | null; // null if any copy missing
export function rangeReady(
	stacks: FacetStack[],
	from: number,
	to: number,
	cards: ReadonlyMap<string, Card | CustomCard>
): boolean;
```

- Produces (hook):

```ts
export interface PagedCards {
	visibleStacks: CardStack[];
	hasMore: boolean;
	loadMore: () => void;
	isLoadingMore: boolean;
	isFirstPageLoading: boolean;
	error: Error | null;
	retry: () => void;
}
export function usePagedCards(stacks: FacetStack[], resetKey: string): PagedCards;
```

- [ ] **Step 1: Failing check** — `$SCRATCH/check-page-window.ts`:

```ts
import { windowIds, toCardStack, rangeReady } from '@/lib/collection-index/page-window';
import type { FacetStack } from '@/types/cards';
const st = (o: string, ids: string[]): FacetStack => ({
	oracleId: o,
	name: o,
	cards: ids.map((id) => ({
		id,
		oracle_id: o,
		name: o,
		lang: 'en',
		layout: 'normal',
		set: 's',
		collector_number: '1',
		entry: { rowId: id + 'r', dateAdded: '' },
	})),
});
const stacks = [st('a', ['1', '2']), st('b', ['2', '3']), st('c', ['4'])];
if (windowIds(stacks, 2).join() !== '1,2,3') throw new Error('windowIds');
const cards = new Map([
	['1', { id: '1', name: 'A' }],
	['2', { id: '2', name: 'A' }],
] as never);
if (!toCardStack(stacks[0], cards) || toCardStack(stacks[1], cards)) throw new Error('toCardStack');
if (!rangeReady(stacks, 0, 1, cards) || rangeReady(stacks, 0, 2, cards))
	throw new Error('rangeReady');
if (!rangeReady(stacks, 3, 51, cards)) throw new Error('empty range is ready');
console.log('OK page-window');
```

- [ ] **Step 2: Run** — Expected: FAIL (module missing).

- [ ] **Step 3: `page-window.ts`**

```ts
import type { Card, CardStack, FacetStack } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';

type CardMap = ReadonlyMap<string, Card | CustomCard>;

/** Unique print ids of every copy of `stacks[0..end)`, in display order. */
export function windowIds(stacks: FacetStack[], end: number): string[] {
	const seen = new Set<string>();
	for (const stack of stacks.slice(0, end)) for (const c of stack.cards) seen.add(c.id);
	return [...seen];
}

/** A renderable stack once EVERY copy's full card is known, else null. */
export function toCardStack(stack: FacetStack, cards: CardMap): CardStack | null {
	const full: CardStack['cards'] = [];
	for (const copy of stack.cards) {
		const card = cards.get(copy.id);
		if (!card) return null;
		full.push({ ...card, entry: copy.entry });
	}
	return { oracleId: stack.oracleId, name: stack.name, cards: full };
}

/** True when stacks[from..to) are all renderable (an empty range is ready). */
export function rangeReady(
	stacks: FacetStack[],
	from: number,
	to: number,
	cards: CardMap
): boolean {
	for (const stack of stacks.slice(from, to)) {
		for (const copy of stack.cards) if (!cards.has(copy.id)) return false;
	}
	return true;
}
```

- [ ] **Step 4: Run check** → `OK page-window`.

- [ ] **Step 5: `usePagedCards.ts`**

```ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCardsStore, getCard } from '@/lib/scryfall/store/cards-store';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import { PAGE_SIZE } from '@/lib/collection/constants';
import type { Card, CardStack, FacetStack } from '@/types/cards';
import type { CustomCard } from '@/lib/mpc/types';
import { rangeReady, toCardStack, windowIds } from '../page-window';

export interface PagedCards {
	visibleStacks: CardStack[];
	hasMore: boolean;
	loadMore: () => void;
	isLoadingMore: boolean;
	isFirstPageLoading: boolean;
	error: Error | null;
	retry: () => void;
}

/**
 * Full cards only for what is shown: the visible stacks + one page ahead. The next
 * page is revealed in one block — `loadMore` waits (spinner) until all of its
 * stacks are resolved. `resetKey` change (filters/sort) → back to page 1.
 */
export function usePagedCards(stacks: FacetStack[], resetKey: string): PagedCards {
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [wantMore, setWantMore] = useState(false);
	const [trackedKey, setTrackedKey] = useState(resetKey);
	const [attempt, setAttempt] = useState(0);
	const [error, setError] = useState<Error | null>(null);

	if (trackedKey !== resetKey) {
		setTrackedKey(resetKey);
		setVisibleCount(PAGE_SIZE);
		setWantMore(false);
		setError(null);
	}

	const ids = useMemo(() => windowIds(stacks, visibleCount + PAGE_SIZE), [stacks, visibleCount]);
	const idsKey = useMemo(() => ids.join(','), [ids]);

	// Same scoped-selector pattern as useCollectionCards: re-render only when a card
	// of THIS window lands in the global store.
	const cards = useCardsStore(
		useShallow((s) => {
			const m = new Map<string, Card | CustomCard>();
			for (const id of ids) {
				const c = s.cards.get(id);
				if (c) m.set(id, c);
			}
			return m;
		})
	);

	useEffect(() => {
		const missing = idsKey ? idsKey.split(',').filter((id) => !getCard(id)) : [];
		if (missing.length === 0) return;
		const cancelled = { current: false };
		resolveCardsByScryfallIds(missing, { isCancelled: () => cancelled.current })
			.then((resolved) => {
				if (cancelled.current) return;
				const still = missing.filter((id) => !resolved.has(id));
				setError(still.length > 0 ? new Error(`${still.length} cards could not be loaded`) : null);
			})
			.catch((err) => {
				if (!cancelled.current) setError(err instanceof Error ? err : new Error(String(err)));
			});
		return () => {
			cancelled.current = true;
		};
	}, [idsKey, attempt]);

	const nextReady = rangeReady(stacks, visibleCount, visibleCount + PAGE_SIZE, cards);
	// Render-time reveal of a requested page once it is complete.
	if (wantMore && nextReady && visibleCount < stacks.length) {
		setVisibleCount(visibleCount + PAGE_SIZE);
		setWantMore(false);
	}

	const visibleStacks = useMemo(
		() =>
			stacks
				.slice(0, visibleCount)
				.map((s) => toCardStack(s, cards))
				.filter((s): s is CardStack => s !== null),
		[stacks, visibleCount, cards]
	);

	const firstEnd = Math.min(PAGE_SIZE, stacks.length);
	return {
		visibleStacks,
		hasMore: visibleCount < stacks.length,
		loadMore: () => {
			if (nextReady) setVisibleCount((v) => v + PAGE_SIZE);
			else setWantMore(true);
		},
		isLoadingMore: wantMore,
		isFirstPageLoading: !rangeReady(stacks, 0, firstEnd, cards) && error === null,
		error,
		retry: () => {
			setError(null);
			setAttempt((a) => a + 1);
		},
	};
}
```

- [ ] **Step 6: Static gates + commit**

```bash
git add src/lib/collection-index/page-window.ts src/lib/collection-index/hooks/usePagedCards.ts
git commit -m "feat(collection-index): paged full-card resolution, next page gated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Collection models + `CollectionView` renders a model

**Files:**

- Create: `src/lib/collection-index/collection-model.ts`, `src/lib/collection-index/hooks/useIndexedCollection.ts`, `src/lib/collection-index/hooks/useStackCollectionModel.ts`, `src/lib/collection-index/load-card-copies.ts`
- Modify: `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx`, `src/app/[locale]/users/[userId]/collection/page.tsx`, `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Produces:

```ts
// collection-model.ts
export interface CollectionModel {
	filters: CollectionFilters;
	setFilters: (f: CollectionFilters) => void;
	activeFilterCount: number;
	sets: ScryfallSet[];
	setsLoading: boolean;
	stats: CollectionStats;
	visibleStacks: CardStack[];
	hasMore: boolean;
	loadMore: () => void;
	isLoadingMore: boolean;
	/** True until the first page can be shown. */
	isInitialLoading: boolean;
	error: Error | null;
	retry: () => void;
}
// useIndexedCollection.ts
export function useIndexedCollection(
	entries: Array<{ scryfallId: string; entry: CardEntry }>,
	opts: { filterable: boolean }
): CollectionModel;
// useStackCollectionModel.ts
export function useStackCollectionModel(stacks: CardStack[], isLoading: boolean): CollectionModel;
// load-card-copies.ts
export async function loadCardCopies(
	entries: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<CardCopy[]>;
```

`CollectionView` props become: `model: CollectionModel; entryCount: number; isLoaded: boolean;` + the unchanged `title, actions, emptyState, onCardClick, buildCardMenuItems, showDeckBadges, filterLayout, panelOpen, children`. Removed: `stacks, isHydrating, totalExpected, isFullyLoaded`.

- [ ] **Step 1: `collection-model.ts`** — the interface above, importing `CollectionFilters` from `@/lib/card/utils/filterCollectionCards`, `CardStack, CollectionStats` from `@/types/cards`, and `ScryfallSet` from wherever `useScryfallSets` gets it (`grep -n "ScryfallSet" src/lib/scryfall/hooks/useScryfallSets.ts`).

- [ ] **Step 2: `load-card-copies.ts`**

```ts
import { getCard } from '@/lib/scryfall/store/cards-store';
import { resolveCardsByScryfallIds } from '@/lib/scryfall/resolveCardsByScryfallIds';
import type { CardCopy, CardEntry } from '@/types/cards';

/** Every entry as a full CardCopy — for exports/PDF, which need all cards at once. */
export async function loadCardCopies(
	entries: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<CardCopy[]> {
	const missing = [...new Set(entries.map((e) => e.scryfallId))].filter((id) => !getCard(id));
	if (missing.length > 0) await resolveCardsByScryfallIds(missing);
	const out: CardCopy[] = [];
	for (const { scryfallId, entry } of entries) {
		const card = getCard(scryfallId);
		if (card) out.push({ ...card, entry });
	}
	return out;
}
```

- [ ] **Step 3: `useIndexedCollection.ts`**

```ts
'use client';

import { useMemo, useState } from 'react';
import {
	defaultCollectionFilters,
	type CollectionFilters,
} from '@/lib/card/utils/filterCollectionCards';
import { filterStacks, groupByOracleId } from '@/lib/card/utils/group-cards';
import { computeCollectionStats } from '@/app/[locale]/collection/lib/CollectionView/stats';
import { useScryfallSets } from '@/lib/scryfall/hooks/useScryfallSets';
import { countActiveFilters } from '@/lib/search/types';
import type { CardEntry, FacetCopy, FacetStack } from '@/types/cards';
import { useCollectionIndex } from '../context/CollectionIndexProvider';
import { usePagedCards } from './usePagedCards';
import type { CollectionModel } from '../collection-model';

/**
 * Owner collection / wishlist: sort, filter, group and stats run on the global
 * facets index (instant); full cards are resolved only for the visible page + 1.
 * `filterable: false` (wishlist) keeps entry order and skips filtering.
 */
export function useIndexedCollection(
	entries: Array<{ scryfallId: string; entry: CardEntry }>,
	opts: { filterable: boolean }
): CollectionModel {
	const index = useCollectionIndex();
	const [filters, setFilters] = useState<CollectionFilters>(defaultCollectionFilters);
	const { sets, isLoading: setsLoading } = useScryfallSets();

	const facetStacks = useMemo<FacetStack[]>(() => {
		const copies: FacetCopy[] = [];
		for (const { scryfallId, entry } of entries) {
			const f = index.getFacets(scryfallId);
			if (f) copies.push({ ...f, entry } as FacetCopy);
		}
		const grouped = groupByOracleId(copies);
		return opts.filterable ? filterStacks(grouped, filters) : grouped;
	}, [entries, index.getFacets, filters, opts.filterable]);

	const stats = useMemo(() => computeCollectionStats(facetStacks), [facetStacks]);
	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
	const resetKey = opts.filterable ? JSON.stringify(filters) : 'static';
	const paged = usePagedCards(facetStacks, resetKey);

	const indexLoading = index.status === 'loading';
	return {
		filters,
		setFilters,
		activeFilterCount,
		sets,
		setsLoading,
		stats,
		visibleStacks: paged.visibleStacks,
		hasMore: paged.hasMore,
		loadMore: paged.loadMore,
		isLoadingMore: paged.isLoadingMore,
		isInitialLoading: indexLoading || (index.status === 'ready' && paged.isFirstPageLoading),
		error: index.status === 'error' ? index.error : paged.error,
		retry: index.status === 'error' ? index.retry : paged.retry,
	};
}
```

(`countActiveFilters` is imported the same way `useCollectionFiltering.ts` does; check its exact import path there.)

- [ ] **Step 4: `useStackCollectionModel.ts`** (public profile pages, still full stacks from `useCollectionCards`)

```ts
'use client';

import { useState } from 'react';
import type { CardStack } from '@/types/cards';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useCollectionFiltering } from '@/app/[locale]/collection/lib/CollectionView/useCollectionFiltering';
import type { CollectionModel } from '../collection-model';

/** Adapter for pages that already hold every full stack (public collection). */
export function useStackCollectionModel(stacks: CardStack[], isLoading: boolean): CollectionModel {
	const { filters, setFilters, sets, setsLoading, filteredStacks, stats, activeFilterCount } =
		useCollectionFiltering(stacks);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [trackedFilters, setTrackedFilters] = useState(filters);
	if (trackedFilters !== filters) {
		setTrackedFilters(filters);
		setVisibleCount(PAGE_SIZE);
	}
	return {
		filters,
		setFilters,
		activeFilterCount,
		sets,
		setsLoading,
		stats,
		visibleStacks: filteredStacks.slice(0, visibleCount),
		hasMore: visibleCount < filteredStacks.length,
		loadMore: () => setVisibleCount((v) => v + PAGE_SIZE),
		isLoadingMore: false,
		isInitialLoading: isLoading,
		error: null,
		retry: () => {},
	};
}
```

- [ ] **Step 5: Strings** — add to `messages/en.json` / `messages/fr.json` under `"collection"`:
  - `"loadError": "Some cards could not be loaded."` / `"Certaines cartes n'ont pas pu être chargées."`
  - `"exporting": "Exporting…"` / `"Export en cours…"`
    and under `"wishlist"`: `"preparingPdf": "Preparing…"` / `"Préparation…"`. (Retry label reuses `error.retry`.)

- [ ] **Step 6: `CollectionView.tsx`** —
  - Props: replace `stacks, entryCount, isHydrating, totalExpected, isLoaded, isFullyLoaded` with `model: CollectionModel; entryCount: number; isLoaded: boolean;` (keep the JSDoc style, one line each).
  - Delete the `useCollectionFiltering` call and the `isLoadingCollection`/`skeletonCount` derivation. Instead:

```ts
const tError = useTranslations('error');
const { filters, setFilters, sets, setsLoading, stats, activeFilterCount, visibleStacks } = model;
const skeletonCount = Math.min(PAGE_SIZE, Math.max(1, entryCount));
```

- `representativeCards` / `stackByCardId`: compute from `visibleStacks` (same code, `filteredStacks` → `visibleStacks`).
- Body:

```tsx
	const errorBox = model.error && (
		<div className={styles.loadError} role="alert">
			<p>{t('loadError')}</p>
			<Button variant="secondary" onClick={model.retry}>
				{tError('retry')}
			</Button>
		</div>
	);

	let body: ReactNode;
	if (isLoaded && entryCount === 0) {
		body = emptyState ?? null;
	} else if (model.isInitialLoading || (!isLoaded && entryCount === 0)) {
		body = <CardList cards={[]} isLoading skeletonCount={skeletonCount} viewModes={['grid']} />;
	} else if (model.error && visibleStacks.length === 0) {
		body = errorBox;
	} else {
		body = (
			<>
				<CardList
					cards={representativeCards}
					isLoading={false}
					pageSize={false}
					hasMore={model.hasMore && !model.error}
					onLoadMore={model.loadMore}
					isLoadingMore={model.isLoadingMore}
					…all existing props unchanged (onCardClick, buildCardMenuItems, renderOverlay, sortOrder, sortDir, onSortChange, tableColumns)…
				/>
				{errorBox}
			</>
		);
	}
```

- Stats line condition: `entryCount > 0 && !model.isInitialLoading`.
- Add to `CollectionView.module.css`:

```css
.loadError {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
	padding: 2rem 1rem;
	text-align: center;
}
```

- Import `Button` from `@/components/Button/Button` and `CollectionModel`.

- [ ] **Step 7: Public page** — in `src/app/[locale]/users/[userId]/collection/page.tsx` (`PublicCollectionView`): after `const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);` add `const model = useStackCollectionModel(stacks, !isFullyLoaded || isHydrating);` and pass `model={model} entryCount={entries.length} isLoaded={isLoaded}` instead of the removed props. Drop `totalExpected` if now unused. Do the same in `src/app/[locale]/users/[userId]/wishlist/page.tsx` only if it renders `<CollectionView>` (`grep -n "<CollectionView" "src/app/[locale]/users/[userId]/wishlist/page.tsx"`).

- [ ] **Step 8: Static gates** on all touched files (the owner `collection/page.tsx` still passes old props — it is fixed in Task 11; tsc errors limited to that file are expected here and must be gone after Task 11).

- [ ] **Step 9: Commit**

```bash
git add src/lib/collection-index/collection-model.ts src/lib/collection-index/load-card-copies.ts src/lib/collection-index/hooks/useIndexedCollection.ts src/lib/collection-index/hooks/useStackCollectionModel.ts "src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx" "src/app/[locale]/collection/lib/CollectionView/CollectionView.module.css" "src/app/[locale]/users/[userId]/collection/page.tsx" messages/en.json messages/fr.json
git commit -m "feat(collection): CollectionView renders a CollectionModel (indexed or full stacks)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Owner collection page + async export

**Files:**

- Modify: `src/app/[locale]/collection/page.tsx`, `src/app/[locale]/collection/ExportMenu/ExportMenu.tsx`
- Delete: `src/app/[locale]/collection/CollectionCardsContext.tsx`

**Interfaces:**

- `ExportMenu` props become `{ cards: CardCopy[] | (() => Promise<CardCopy[]>); filenameBase: string; disabled?: boolean }`.

- [ ] **Step 1: `ExportMenu`** — add `const [busy, setBusy] = useState(false);` and a resolver:

```ts
const getCards = useCallback(async () => (typeof cards === 'function' ? cards() : cards), [cards]);

const exportWith = useCallback(
	(serialize: (c: CardCopy[]) => string, suffix: string) => {
		setOpen(false);
		setBusy(true);
		void getCards()
			.then((list) => downloadCSV(serialize(list), `${filenameBase}-${suffix}.csv`))
			.catch((err) => console.error('[ExportMenu] export failed:', err))
			.finally(() => setBusy(false));
	},
	[getCards, filenameBase]
);
const exportMoxfield = useCallback(
	() => exportWith(serializeToMoxfieldCSV, 'moxfield'),
	[exportWith]
);
const exportCardNexus = useCallback(
	() => exportWith(serializeToCardNexusCSV, 'cardnexus'),
	[exportWith]
);
```

Button: `disabled={disabled || busy}` and label `{busy ? t('exporting') : `${t('export')} ▾`}`. Public page callers passing an array keep working.

- [ ] **Step 2: `collection/page.tsx`** —
  - Remove `CollectionCardsProvider`/`useCollectionCardsContext` imports and usage; `export default function CollectionPage() { return <CollectionPageInner />; }`.
  - In `CollectionPageInner`: `const { entries, isLoaded, clearCollection } = useCollectionContext();` and `const model = useIndexedCollection(entries, { filterable: true });`.
  - `isLoadingCollection` is gone: ExportMenu becomes

```tsx
<ExportMenu cards={() => loadCardCopies(entries)} filenameBase="my-collection" disabled={isBusy} />
```

- `<CollectionView model={model} entryCount={entries.length} isLoaded={isLoaded} …rest unchanged…>`; remove `stacks`, `isHydrating`, `totalExpected`, `isFullyLoaded` props.
- Keep `if (!isLoaded) return <div className={styles.page} />;`.

- [ ] **Step 3: Delete** `CollectionCardsContext.tsx`; `grep -rn "CollectionCardsContext\|useCollectionCardsContext" src` → no output.

- [ ] **Step 4: Static gates** on page, ExportMenu, CollectionView: `npx tsc --noEmit 2>&1 | grep -E 'collection/|users/'` → no output.

- [ ] **Step 5: Runtime** — `npm run dev`, 9.7k user, DevTools Network + Performance:
  1. Clear site data (cold). Open `/collection`. Expected: skeletons, then the first 48 stacks appear; Network shows `rpc/card_facets` (≈3) + `card_prints?id=in.(…)` batches (≈ a handful for 96 stacks) and **no** `/api/scryfall/cards/collection` unless a catalog miss is on page 1–2. Note the time-to-first-card.
  2. Scroll to the bottom fast: spinner, then the next 48 stacks appear at once; no partially empty tiles.
  3. Change a filter (e.g. color G) during a scroll: grid resets to page 1 of green cards; no flash of non-green cards.
  4. Reload (warm): first page appears almost immediately; 0 `card_facets` calls.
  5. Export → Moxfield CSV: button shows "Exporting…", file contains 9 702 data lines (`wc -l` minus header).
  6. Compare time-to-first-card with the Task 0 baseline.

- [ ] **Step 6: Commit**

```bash
git rm "src/app/[locale]/collection/CollectionCardsContext.tsx"
git add "src/app/[locale]/collection/page.tsx" "src/app/[locale]/collection/ExportMenu/ExportMenu.tsx"
git commit -m "feat(collection): owner page on the index — fast first page, async export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Wishlist page, async PDF, card modal on demand

**Files:** Modify `src/app/[locale]/wishlist/page.tsx`, `src/app/[locale]/wishlist/useWishlistPdf.ts`, `src/contexts/CardModalProvider.tsx`

**Interfaces:**

- `useWishlistPdf(loadCards: () => Promise<CardCopy[]>)` → `{ pdfCards, isModalOpen, isPreparing, openModal, closeModal, isGenerating, generate }`.

- [ ] **Step 1: `useWishlistPdf`** — replace the `stacks` param and `pdfCards` memo:

```ts
export function useWishlistPdf(loadCards: () => Promise<CardCopy[]>) {
	const [isModalOpen, setModalOpen] = useState(false);
	const [isGenerating, setGenerating] = useState(false);
	const [isPreparing, setPreparing] = useState(false);
	const [pdfCards, setPdfCards] = useState<CardCopy[]>([]);
	const preferredLang = usePreferredCardLang();

	// One card per wishlist copy; every copy must be resolved before the modal opens.
	const openModal = useCallback(() => {
		setPreparing(true);
		void loadCards()
			.then((cards) => {
				setPdfCards(cards);
				setModalOpen(true);
			})
			.catch((err) => console.error('[useWishlistPdf] loading cards failed:', err))
			.finally(() => setPreparing(false));
	}, [loadCards]);
	… generate unchanged …
	return { pdfCards, isModalOpen, isPreparing, openModal, closeModal: useCallback(() => setModalOpen(false), []), isGenerating, generate };
}
```

(`CardStack` import → `CardCopy`.)

- [ ] **Step 2: Wishlist page** — replace `useCollectionCards(entries)` with:

```ts
const model = useIndexedCollection(entries, { filterable: false });
const stacks = model.visibleStacks;
const loadAll = useCallback(() => loadCardCopies(entries), [entries]);
const pdf = useWishlistPdf(loadAll);
```

- `useMoveToCollection(stacks, …)` keeps working: moves are requested from visible cards only.
- Stats line: `t('stats', { cards: entries.length, unique: model.stats.uniqueCards })`, shown when `entries.length > 0 && !model.isInitialLoading`.
- PDF button: `onClick={pdf.openModal} disabled={pdf.isPreparing}` with label `pdf.isPreparing ? t('preparingPdf') : t('generatePdf')`.
- ExportMenu: `cards={loadAll}` and `disabled={isImporting}`.
- `CardList`: `cards={representativeCards}`, `isLoading={model.isInitialLoading}`, `skeletonCount={Math.min(PAGE_SIZE, entries.length)}`, `pageSize={false}`, `hasMore={model.hasMore && !model.error}`, `onLoadMore={model.loadMore}`, `isLoadingMore={model.isLoadingMore}`; render the same error box as CollectionView under it when `model.error` (use `useTranslations('collection')('loadError')` + `error.retry`).
- Remove the now-unused `isHydrating` and `useCollectionCards` import.

- [ ] **Step 3: Card modal resolves the stack on open** — in `CardModalProvider.tsx`:

```ts
const index = useCollectionIndex();
const [resolveTick, setResolveTick] = useState(0);

// The grid only resolves what it shows, so a stack's OTHER prints (or the
// collection copies of a card opened from the wishlist) may not be in the card
// store yet. Resolve every print sharing the oracle key, then re-derive.
const openOracleKey = open?.kind === 'stack' ? open.oracleKey : null;
useEffect(() => {
	if (!openOracleKey) return;
	const missing = index.printsForOracle(openOracleKey).filter((id) => !getCard(id));
	if (missing.length === 0) return;
	const cancelled = { current: false };
	void resolveCardsByScryfallIds(missing, { isCancelled: () => cancelled.current }).then(() => {
		if (!cancelled.current) setResolveTick((t) => t + 1);
	});
	return () => {
		cancelled.current = true;
	};
}, [openOracleKey, index]);
```

Add `resolveTick` to the `resolved` memo deps (`[open, collection.entries, wishlist.entries, resolveTick]`), with a comment `// resolveTick: re-derive once on-demand resolution lands`. Imports: `useCollectionIndex`, `resolveCardsByScryfallIds`, `useEffect`, `useState` (if not already).

- [ ] **Step 4: Static gates** on the 3 files.

- [ ] **Step 5: Runtime** —
  1. `/wishlist` cold: first page fast, scroll gated, Export + PDF work (PDF button shows "Preparing…" then the modal lists every copy).
  2. On `/wishlist`, open a card that you also own in the collection: the modal shows the collection copies after a short resolve (Review Focus 4).
  3. On `/collection`, open a 3-print stack: all 3 prints in the modal; change print → modal stays on the new print.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/wishlist/page.tsx" "src/app/[locale]/wishlist/useWishlistPdf.ts" src/contexts/CardModalProvider.tsx
git commit -m "feat(wishlist): paged on the index; PDF + modal resolve on demand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Phase 1 verification

- [ ] **Step 1:** `npm run build` — Expected: success. Fix any TS2589 by splitting builder chains (Global Constraints).
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep -c 'error TS'` ≤ the Task 0 baseline; `npx eslint` on every file changed since `main` (`git diff --name-only main... -- '*.ts' '*.tsx'`) → clean.
- [ ] **Step 3: Review Focus runtime pass** (dev server, 9.7k user):
  1. An entry missing from the catalog (pick one of the 92: `select e.scryfall_id from card_entries e where owner_id='8a21408f-…' and not exists (select 1 from card_prints p where p.id::text=e.scryfall_id) limit 3`): it shows in the grid (Scryfall fallback) — find it by name filter.
  2. An `mpc:` entry: shows with its custom badge; `cardTypeFilter`/`mpcTagsFilter` still work.
  3. Temporarily point a cached entry at a bogus uuid in IDB (or insert a test row with `scryfall_id='00000000-0000-4000-8000-000000000000'` locally, then delete it): grid becomes ready, console shows the `[loadFacets] … excluded` warn, no infinite skeleton.
  4. Block `rpc/card_facets` in DevTools (Network → Block request URL) on a cold cache: grid still loads via fallback (slower) — or, if the fallback is also blocked, shows the error + "Try again", which recovers after unblocking.
  5. Block `card_entries` requests after the cache is warm and reload: the cached collection stays visible, console shows `[collection-store] hydrate failed`, nothing is truncated.
  6. Log out → log in as another user: no previous user's cards; IDB `card-facets` was cleared at logout.
  7. Empty collection user: empty state appears, no skeleton stuck.
- [ ] **Step 4: Record** the before/after time-to-first-card (cold and warm) for the summary.

---

## Phase 2

### Task 14: Deck ownership from the index + pending badge

**Files:** Modify `src/lib/collection/hooks/useCollectionOracleIds.ts`, `src/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge.ts`, `src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx`, `src/lib/card/components/OwnershipBadge/OwnershipBadge.module.css`, `src/app/[locale]/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx`, `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- `useCollectionOracleIds(deckScryfallIds, entries)` keeps its signature and `ReadonlyMap<string, string>` return; the owned side now comes from the index (no `printIdsByOracleIds` query, Scryfall-fallback prints included).
- `BadgeState` gains `'pending'`. `useCollectionBadge(…, wishlistEntries?, isPending = false)`; `DeckCardOverlay` gains prop `ownershipPending?: boolean`.
- Out of scope, by design: `useDeckCardIndex` (it indexes **deck** copies, not the collection — it already benefits from the faster resolver).

- [ ] **Step 1: `useCollectionOracleIds`** — keep the deck-side catalog lookup (`oracleIdsByPrintIds(deckIds)`), drop step 2, and merge the owned side from the index:

```ts
	const index = useCollectionIndex();
	…
	// Owned side: straight from the global index (already loaded, includes prints the
	// catalog lacks via the Scryfall fallback) — no second catalog query.
	const owned = useMemo(() => {
		const m = new Map<string, string>();
		for (const id of entriesKey ? entriesKey.split(',') : []) {
			const f = index.getFacets(id);
			if (f?.oracle_id) m.set(id, f.oracle_id);
		}
		return m;
	}, [entriesKey, index.getFacets]);
```

and return `deckKey ? new Map([...owned, ...map]) : EMPTY_MAP` memoized on `[deckKey, owned, map]`. Update the doc comment: the owned side now reads the index. Remove the `printIdsByOracleIds` import if unused.

- [ ] **Step 2: Pending state** —
  - `useCollectionBadge.ts`: `export type BadgeState = 'none' | 'locked' | 'partial' | 'owned' | 'wishlist' | 'pending';` add trailing param `isPending = false`; inside the memo, right after `ownedCount`/`hasWishlistedDeckCopy` are known: if the card's own copies already decide the state (`ownedCount > 0` → owned, `hasWishlistedDeckCopy` → wishlist), keep that; otherwise `if (isPending) return { badgeState: 'pending', ownedCount, neededCount, tooltipCopies: [], wishlistTooltipCopies: [] };`. Add `isPending` to the memo deps.
  - `OwnershipBadge.tsx`: `pending: styles.ownershipBadgePending` in `BADGE_CLASS_MAP`, `pending: '…'` in `BADGE_TEXT_STATIC`; when `badgeState === 'pending'` render with `aria-busy="true"` and **no** `onClick`.
  - `OwnershipBadge.module.css`: `.ownershipBadgePending { composes: ownershipBadgeGrey; opacity: 0.6; cursor: progress; }` (if `composes` is not used in this file, copy the grey rule's properties instead).
  - `DeckCardOverlay.tsx`: new optional prop `ownershipPending?: boolean`, forwarded as the last argument of `useCollectionBadge`; the "none → add to collection" click branch is unaffected because the state is `'pending'`, not `'none'`.
  - `DeckDetailOwnerView.tsx`: `const { status: indexStatus } = useCollectionIndex();` and pass `ownershipPending={indexStatus === 'loading'}` to `<DeckCardOverlay>`.

- [ ] **Step 3: Static gates** on the 6 files + `npm run build`.

- [ ] **Step 4: Runtime** — clear site data, open a deck you own directly (not via the collection): badges show a dimmed "…" briefly, then the real state; no badge ever shows a grey "none" that later turns green. Warm reload: no "…" at all. Opening the "copies available" flow (`findFreeCollectionCopy`) still offers substitutable copies, including a print missing from the catalog.

- [ ] **Step 5: Commit**

```bash
git add src/lib/collection/hooks/useCollectionOracleIds.ts "src/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge.ts" src/lib/card/components/OwnershipBadge/OwnershipBadge.tsx src/lib/card/components/OwnershipBadge/OwnershipBadge.module.css "src/app/[locale]/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx" "src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx"
git commit -m "feat(decks): ownership from the collection index, pending badge while loading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Final verification + prod notes

- [ ] **Step 1:** `npm run build`, tsc/eslint gates as in Task 13 Step 2.
- [ ] **Step 2:** Re-run Task 13 Step 3 items 1, 4, 6 quickly (regressions from phase 2).
- [ ] **Step 3:** Prod checklist (do **not** run without the user): apply `20261003120000_card_facets.sql` through the Coolify SQL editor, insert its version into `supabase_migrations.schema_migrations`, `npm run sb:verify:prod`, then `curl -s -X POST "$PROD_URL/rest/v1/rpc/card_facets" -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"p_ids":[]}'` → `[]`. Remind that the prod catalog is stale (2026-07-25): expect more Scryfall fallbacks there until it is re-seeded.
