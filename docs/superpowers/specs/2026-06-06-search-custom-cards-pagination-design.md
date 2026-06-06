# Search — Custom Cards Server-Side Pagination

**Date:** 2026-06-06  
**Status:** Approved

## Problem

`getCustomCards` and `getAllCustomCards` fetch up to 10,000 rows in a single Supabase query. All filtering (name, colors, cmc, tags, type) happens client-side via `filterCollectionCards`, and the result is paginated locally by `CardList`. As the custom card catalog grows indefinitely, this approach causes slow initial loads, high memory usage, and renders the page unusable at scale.

## Goal

Replace client-side bulk fetch + local filter with server-side paginated queries to Supabase, matching the pattern already used by `useScryfallCardSearch`. Load only the cards needed for the current view (48 per page), push filters to SQL, and append pages on scroll.

## Out of Scope

- True interleaved sort across Scryfall + custom (requires a unified backend API — deferred)
- Offline/cached custom card data
- Changes to `CardList`, `CardListGrid`, or `useInfiniteScroll`

---

## Architecture

### 1. Migration — Search Indexes

New migration `20260606000001_add_custom_cards_search_indexes.sql`:

```sql
-- Enable trigram extension for ilike performance
create extension if not exists pg_trgm;

create index if not exists custom_cards_name_trgm_idx
  on public.custom_cards using gin (name gin_trgm_ops);

create index if not exists custom_cards_type_line_trgm_idx
  on public.custom_cards using gin (type_line gin_trgm_ops)
  where type_line is not null;

create index if not exists custom_cards_tags_gin_idx
  on public.custom_cards using gin (tags);

create index if not exists custom_cards_rarity_idx
  on public.custom_cards (rarity)
  where rarity is not null;
```

The existing `custom_cards_colors_idx` (gin on colors) and `custom_cards_cmc_idx` are already in place from a prior migration.

### 2. `src/lib/supabase/custom-cards.ts`

Replace `getCustomCards(sourceId)` and `getAllCustomCards()` with a single unified function:

```ts
interface CustomCardQuery {
	sourceId?: string | null;
	page: number;
	pageSize: number;
	filters: {
		name?: string;
		colors?: string[];
		colorMatch?: 'exact' | 'include' | 'atMost';
		type?: string;
		cmc?: string;
		rarities?: string[];
		oracleText?: string;
		mpcTagsFilter?: string[];
		order?: string;
		dir?: 'asc' | 'desc' | 'auto';
	};
}

interface CustomCardPage {
	cards: MpcCard[];
	hasMore: boolean;
	total: number;
}

export async function queryCustomCards(query: CustomCardQuery): Promise<CustomCardPage>;
```

**Filter translation:**

- `name` → `.ilike('name', '%name%')` (trigram index handles performance)
- `colors` with `exact` → filter post-query (Supabase lacks exact array equality; array is small enough)
- `colors` with `include` → `.overlaps('colors', colors)`
- `colors` with `atMost` → filter post-query
- `cmc` → parse operator string (`>=3`, `<5`, `2`) → `.gte/.lte/.gt/.lt/.eq`
- `rarities` → `.in('rarity', rarities)`
- `type` → `.ilike('type_line', '%type%')`
- `oracleText` → `.ilike('oracle_text', '%text%')`
- `mpcTagsFilter` → `.overlaps('tags', mpcTagsFilter)`
- `sourceId` → `.eq('source_id', sourceId)` (when provided)
- Pagination → `.range(offset, offset + pageSize - 1)`
- Sort → `.order(column, { ascending })` mapping same keys as Scryfall (name → `name`, cmc → `cmc`, etc.), fallback to `name asc`

**Count:** use `.select(CUSTOM_CARD_SELECT, { count: 'exact', head: false })` — Supabase returns `count` in the response.

**`hasMore`:** `offset + data.length < total`

Keep `getCustomCardSources()` and `getCustomCardSourcesWithCount()` unchanged.

### 3. `src/lib/mpc/hooks/useCustomCards.ts`

Refactor from a single-shot loader to an infinite scroll hook:

**Inputs:** `sourceId?: string | null`, `filters: SearchFilters & { mpcTagsFilter: string[] }`  
**Output:** `{ cards, isLoading, isLoadingMore, hasMore, total, error, loadMore }`

Behavior:

- Debounce all filter fields 300ms before fetching (same as `useScryfallCardSearch`)
- On filter/sourceId change: reset to page 1, replace `cards`
- `loadMore()`: fetch next page, append to `cards`
- Abort in-flight requests on filter change (AbortController pattern from `useScryfallCardSearch`)
- Only active when `sourceId !== undefined` (i.e., when `mode` requires custom cards)

### 4. `src/app/search/page.tsx`

**Pass filters into the hook:**

```ts
const {
	cards: customCards,
	isLoading: customLoading,
	isLoadingMore: customLoadingMore,
	hasMore: customHasMore,
	loadMore: loadMoreCustom,
} = useCustomCards(mode === 'custom' || mode === 'all' ? customSourceId : undefined, {
	name,
	colors,
	colorMatch,
	type,
	set,
	rarities,
	oracleText,
	cmc,
	order,
	dir,
	mpcTagsFilter,
});
```

Remove `filterCollectionCards` call for custom cards — filtering is now done server-side.

**Mode `all` — unified list:**

```ts
const mergedCards = useMemo(() => {
	if (mode === 'all') return [...cards, ...customCards.filter((c) => !c.oracleId)];
	if (mode === 'custom') return customCards;
	return cards;
}, [mode, cards, customCards]);
```

Custom cards without `oracleId` are cards that have no Scryfall equivalent — they appear appended after Scryfall results. Custom cards with `oracleId` are printing variants and are excluded in mode `all` (they already appear via Scryfall).

**`hasMore` and `loadMore` for mode `all`:**

```ts
const resolvedHasMore =
	mode === 'all' ? hasMore || customHasMore : mode === 'custom' ? customHasMore : hasMore;

const resolvedLoadMore = () => {
	if (mode === 'all') {
		if (hasMore) loadMore();
		if (customHasMore) loadMoreCustom();
	} else if (mode === 'custom') {
		loadMoreCustom();
	} else {
		loadMore();
	}
};
```

Pass `resolvedHasMore`, `resolvedLoadMore`, and combined `isLoadingMore` to `<CardList>`.

**`isLoadingMore`** in mode `all`: `isLoadingMore || customLoadingMore`

### 5. `CardList` / `CardListGrid` / `useInfiniteScroll`

No changes required. They already accept `hasMore`, `onLoadMore`, `isLoadingMore` from the caller.

---

## Data Flow

```
User types in SearchBar
  → debounce 300ms
  → useCustomCards fetches page 1 from Supabase (filtered, 48 rows)
  → CardList renders first 48 cards
  → User scrolls to bottom
  → sentinel enters viewport
  → useInfiniteScroll fires onLoadMore
  → loadMore() fetches page 2 from Supabase
  → cards appended, scroll continues
```

---

## Error Handling

- Supabase errors surface as `error` string in hook state, displayed via existing `<div className={styles.error}>` in page.tsx
- Abort on filter change prevents stale responses from overwriting newer results
- `total` count displayed in result info bar for `mode=custom` and `mode=all`

---

## Testing Checklist

- [ ] mode=custom: first 48 cards load, scroll loads next 48
- [ ] mode=custom: name filter triggers refetch, resets to page 1
- [ ] mode=custom: color filter works (include, atMost)
- [ ] mode=custom: cmc filter with operators (>=3, <5, 2)
- [ ] mode=custom: tag filter works
- [ ] mode=all: scryfall cards appear first, custom cards without oracleId appended
- [ ] mode=all: custom cards with oracleId are excluded
- [ ] mode=all: both sources load more on scroll
- [ ] mode=official: custom cards hook not invoked (sourceId=undefined)
- [ ] Changing mode resets both lists
- [ ] Fast filter changes don't cause stale-data race conditions
