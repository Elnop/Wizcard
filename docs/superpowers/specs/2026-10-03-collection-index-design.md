# Collection index — fast first page, on-demand card data

**Date**: 2026-10-03
**Status**: Design approved, ready for planning

## Context and goal

The first load of `/collection` waits a long time before the first card paints. The
pipeline is fully serial and the grid is frozen on skeletons until **everything** is done
(`CollectionView.tsx:83-91`):

1. `collection-store.hydrateFromSupabase` reads every entry, one 1000-row page after the
   other. Each page republishes `entries`, which changes `idsKey` in `useCollectionCards`
   and cancels/restarts the card resolution.
2. `useCollectionCards` resolves **every** print of the collection through
   `resolveCardsByScryfallIds`: IDB cache (24 h TTL), then `POST /api/scryfall/cards/collection`
   in 75-id batches, **awaited one after the other**, behind the Scryfall throttle's
   125 ms gap — although that proxy already answers from the DB catalog first.
3. Only when `isFullyLoaded && !isHydrating` does the grid show anything.

Measured locally on the largest collection: 9 702 entries, 5 372 distinct prints, ≈72
serial proxy POSTs. Full catalog JSON for those prints ≈ **11 MB**; the fields needed to
sort/filter/group ≈ **1.9 MB** + 0.7 MB of oracle text. A SQL "first 48 by name" takes
≈180 ms.

Bug found on the way: `fetchCardRowsPage` (`queries/cards.ts:16-21`) paginates with
`.range()` and **no `.order()`** — Postgres guarantees no order, so pages can overlap or
skip rows past 1000 entries.

**Goal**: show the first page of the collection (and wishlist) fast, have the next page
ready on scroll, keep filters/sort/stats instant — and give the rest of the site a fast,
global source of per-print card facts with an explicit loading state.

## Scope decisions (settled during brainstorming)

| Question                                   | Decision                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Embed via FK on `card_entries.scryfall_id` | **No.** The seed deletes drifted prints; the catalog lags; `mpc:` ids share the column.               |
| Computed relationship `card_print(...)`    | **Deferred** to the public-pages / DB-side filtering effort. Not needed here (entries already local). |
| Strategy                                   | **Light global index** of every owned/wished print + **full cards on demand** for what is displayed.  |
| Index scope                                | **Collection + wishlist.**                                                                            |
| Index transport                            | **RPC `card_facets(uuid[])`** (POST, one round trip, migration).                                      |
| `oracle_text` in index                     | **Yes** (text filter instant).                                                                        |
| Scroll faster than resolution              | **Block the next page** (infinite-scroll spinner) until its 48 stacks are all resolved.               |
| Prefetch                                   | **1 page** (48 stacks) ahead.                                                                         |
| Cache TTL                                  | **Index 30 days** (background refresh); **full cards keep 24 h**.                                     |
| Stale catalog                              | Any print missing from the catalog falls back to **Scryfall** (existing proxy path).                  |
| Dependents' loading state                  | **Discreet placeholder** (skeleton / "…"), never a false "0".                                         |
| Public pages (`/users/[id]/...`)           | **Out of scope** (later, with computed relationships).                                                |
| Delivery                                   | One spec, **two phases** (see end).                                                                   |

Out of scope: catalog freshness for prints that exist but are stale (sub-project 2), prices
(the catalog stores none — unchanged from today's DB path), DB-side filtering/pagination.

## Architecture

`CardStack` / `CardCopy` (full `Card` + entry) are used across the modal, menus, CSV
export, wishlist PDF and `useMoveToCollection`. **They do not change.** A facet layer is
added upstream; real `CardStack`s are built only for displayed stacks.

### 1. `CardFacets` type — `@/types/cards`

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
> & { custom?: true };
export type FacetCopy = CardFacets & { entry: CardEntry };
export interface FacetStack {
	oracleId: string;
	name: string;
	cards: FacetCopy[];
}
```

Exactly the fields read by `filterCollectionCards`, `getSortValue`, `preferPrint` and
`computeCollectionStats` **that `Card` declares**. A full `Card` (and `CustomCard`) is
assignable to `CardFacets`. `set_type` is deliberately absent: `preferPrint` reads it
(`PrintLike.set_type?`) but `Card` does not declare it and DB-path cards never carry it,
so the index stays at parity with today's representative choice.

### 2. RPC `public.card_facets(p_ids uuid[])` — migration

- `language sql stable security invoker`, `set search_path = public`.
- Joins `card_prints` → `card_definitions` (FK `oracle_id`). No `card_sets` join (no
  facet needs it).
- Returns one row per **found** id with the `CardFacets` columns; missing ids are simply
  absent.
- `grant execute ... to anon, authenticated` explicitly (default-ACL drift).
- Called from the browser with the shared Supabase client (POST body → no URL limit).
  Chunk client-side at 2 000 ids per call to bound payload.
- Migration file is idempotent (`create or replace`); mirrored in
  `supabase/verify_schema.sql` (not in `supabase/bootstrap/init_schema.sql`, which has no catalog tables at all).

### 3. `CollectionIndexProvider` — global

Mounted in `src/contexts/Providers.tsx` inside `WishlistProvider` (needs both entry sets).
One role only: the index. It does not own entries nor full cards.

```ts
type CollectionIndex = {
	status: 'loading' | 'ready' | 'error';
	getFacets(scryfallId: string): CardFacets | undefined;
	/** scryfallIds in collection ∪ wishlist sharing this oracle_id. */
	printsForOracle(oracleId: string): string[];
	retry(): void;
};
```

Loading, for the distinct `scryfallId`s of collection ∪ wishlist entries:

1. Read the IDB index store (new object store in the existing card-cache DB, 30-day TTL).
2. Ids not cached: `mpc:` ids → `getCustomCardsByIds`, facets taken from the `CustomCard`;
   others → RPC `card_facets`.
3. Ids still missing (catalog lagging) → `resolveCardsByScryfallIds` (→ proxy → Scryfall);
   facets extracted from the returned `Card` (which also lands in the full-card cache).
4. Write new facets to IDB; set `status: 'ready'`.
5. Cached rows older than the TTL are refreshed **in the background** after `ready`; the
   status does not go back to `loading`.

When entries change (add/import/remove), only the new ids go through steps 2–4; status
stays `ready` (new prints simply appear when their facets arrive).

### 4. Resolver — `resolveCardsByScryfallIds`

Network step changes from "proxy POSTs in series" to:

1. New `catalog-db.byPrintIds(ids)`: chunks of **150** ids, **6 in parallel**, each chunk =
   `card_prints .in('id', chunk)` + existing `assemblePrints` (defs, faces, sets →
   `rowsToCard`). Talks to Supabase directly — no proxy, no Scryfall throttle.
2. Ids not returned (missing from catalog, or a failed chunk) → existing
   `getCardCollection` proxy path in 75-id batches (→ DB → Scryfall).
3. Cache write + `putCards` unchanged. `mpc:` path unchanged.

Signature and return contract unchanged → decks, tokens, search index benefit for free.

### 5. Paged grid — `useIndexedStacks` + `usePagedCards`

- `filterCollectionCards`, `getSortValue`, `preferPrint`, `groupByOracleId`, `filterStacks`,
  `computeCollectionStats` become generic over `T extends CardFacets` (or take
  `FacetCopy`); existing `CardCopy` callers (import preview, etc.) keep compiling since
  `CardCopy` satisfies the bound.
- `useIndexedStacks(entries, filters)`: entries + `getFacets` → `FacetCopy[]` →
  `groupByOracleId` → `filterStacks` (filter + sort) → `FacetStack[]`, plus stats. Entries
  whose print has no facets yet are excluded until they arrive.
- `usePagedCards(facetStacks, visibleCount)`: for stacks `[0, visibleCount + 48)` resolves
  the full cards of **all copies** of those stacks via the resolver, and returns real
  `CardStack[]` for `[0, visibleCount)`. Exposes `hasMore`, `loadMore`, `isPageLoading`,
  `pageError`, `retry`. `loadMore` only advances when the next 48 stacks are fully resolved
  (spinner meanwhile).
- `CollectionView` uses `CardList` with external pagination (`hasMore` / `onLoadMore` /
  `isLoadingMore`) instead of its internal slicing.
- Filter/sort change → pagination resets to the first page.

## Data flow

**Entries (`collection-store`, `wishlist-store`)**

- `fetchCardRowsPage` gets `.order('id')`.
- First page requested with `count: 'exact'`; remaining pages fetched **in parallel**.
- Entries published **once**, when all pages are in. Meanwhile the IDB-cached entries stay
  displayed (no partial first page replacing them). `isFullyLoaded` semantics unchanged.

**First visit (cold cache)**: entries (1 + parallel pages) → index RPC (1–3 POSTs) →
facet sort/filter → full cards for 96 stacks (direct catalog) → **first page paints**.

**Later visits**: entries + index from IDB → order known immediately → first-page cards
often still in the 24 h card cache → near-instant paint; network refresh in background,
grid updates in place without returning to skeletons.

**Grid states**

| Situation                         | Display                                     |
| --------------------------------- | ------------------------------------------- |
| Entries or index not ready        | Skeletons (≤ 48), as today                  |
| Index ready, first page resolving | Skeletons for that page                     |
| Next page not ready on scroll     | Infinite-scroll spinner; page lands at once |
| Empty collection                  | Empty state as soon as entries are known    |
| Index `error` / page failure      | Inline error + "Retry"                      |

**Needs every full card**

- **Collection CSV export** and **wishlist PDF**: resolve everything on click, with a busy
  state on the button. The export button is no longer disabled during page load.
- **Card modal** (`CardModalProvider.resolveStackCards`): today rebuilds a stack from the
  global card store, which was full only because the whole collection was resolved. On
  open it now takes `printsForOracle(oracleKey)` from the index and resolves those prints
  via the resolver before rendering the stack (phase 1 — otherwise regression).
- **Wishlist page**: same `useIndexedStacks` / `usePagedCards` grid.

## Error handling

| Case                               | Behaviour                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| RPC `card_facets` fails            | Treat its ids as catalog misses → resolver. If that fails too: `status: 'error'`, grid shows error + Retry; logged. Never `ready` with silent holes. |
| Print missing from catalog         | Resolver → Scryfall. If Scryfall also lacks it: excluded from the grid (as today), `console.warn` with the count.                                    |
| One `byPrintIds` chunk fails       | Its ids go to the proxy fallback; other chunks unaffected.                                                                                           |
| Partial page failure               | Resolved stacks render, missing ones stay skeleton, Retry replaces the spinner.                                                                      |
| IDB unavailable (private mode)     | Network-only, like the current cache.                                                                                                                |
| Account switch / logout            | Index IDB store cleared alongside the entries cache (`handleLogout`).                                                                                |
| Unmount / filter change mid-flight | `isCancelled` pattern as in the resolver; no `setState` after unmount.                                                                               |

## Phases

**Phase 1** — RPC + `CollectionIndexProvider` + resolver direct-catalog + entries
pagination fix + paged grid (collection & wishlist) + card modal + exports.

**Phase 2** — dependents on the index with discreet placeholders: deck collection badges
(`useCollectionBadge`), `useCollectionOracleIds`. `useDeckCardIndex` is excluded: it indexes
**deck** copies, not the collection, and already benefits from the faster resolver. They already work
without full hydration today, so this is an improvement, not a fix.

## Verification

No test framework. Gates:

- `npm run check` — no **new** problems on changed files (baseline is red).
- `npm run build` — catches TS2589 and server-only import leaks.
- `npm run sb:migrate` then `npm run sb:verify`.

Runtime (Chrome, largest local collection), timing to first card + Network tab,
**before and after**:

- cold cache; warm revisit; filters/sort; fast scroll (spinner);
- entry missing from catalog (92 locally); `mpc:` card;
- empty collection; account switch;
- CSV export; wishlist PDF; modal opened from a stack;
- no `/api/scryfall/cards/collection` request except for catalog misses.

**Prod**: check the RPC with the anon key after applying the migration through the Coolify
SQL editor + `schema_migrations` sync (usual workflow); `sb:verify:prod`.
