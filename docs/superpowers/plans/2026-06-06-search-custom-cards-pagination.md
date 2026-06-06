# Search — Custom Cards Server-Side Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace client-side bulk fetch of all custom cards with server-side paginated Supabase queries that push filters to SQL, loading 48 cards at a time with infinite scroll.

**Architecture:** `queryCustomCards()` in `custom-cards.ts` accepts page/pageSize/filters and queries Supabase with `.range()` + filter clauses. `useCustomCards` becomes an infinite-scroll hook (debounced filters, loadMore, abort on change) mirroring `useScryfallCardSearch`. The search page wires both hooks' `hasMore`/`loadMore` into `CardList`, with mode `all` appending custom-only cards (no `oracleId`) after Scryfall results.

**Tech Stack:** Next.js 15 (App Router), Supabase JS client v2, React hooks, TypeScript, PostgreSQL trigram indexes (`pg_trgm`).

---

## File Map

| File                                                                     | Action      | What changes                                                                                                                                 |
| ------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260606000001_add_custom_cards_search_indexes.sql` | **Create**  | `pg_trgm` extension + 4 new indexes                                                                                                          |
| `src/lib/supabase/custom-cards.ts`                                       | **Modify**  | Add `queryCustomCards()`, keep `getCustomCardSources`/`getCustomCardSourcesWithCount` unchanged, remove `getCustomCards`/`getAllCustomCards` |
| `src/lib/mpc/hooks/useCustomCards.ts`                                    | **Rewrite** | Infinite-scroll hook with debounce, page state, loadMore, abort                                                                              |
| `src/app/search/page.tsx`                                                | **Modify**  | Pass filters to hook, remove `filterCollectionCards`, wire resolved `hasMore`/`loadMore`                                                     |

---

## Task 1: Migration — Search Indexes

**Files:**

- Create: `supabase/migrations/20260606000001_add_custom_cards_search_indexes.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
-- supabase/migrations/20260606000001_add_custom_cards_search_indexes.sql
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

- [ ] **Step 1.2: Apply the migration to local Supabase**

```bash
npm run sb:migrate
```

Expected output: migration applied with no errors. If Supabase is not running, start it first with `npm run sb:start`.

- [ ] **Step 1.3: Verify indexes exist**

```bash
npm run sb:studio
```

Open http://localhost:54323 → Database → Indexes → filter by table `custom_cards`. Confirm `custom_cards_name_trgm_idx`, `custom_cards_type_line_trgm_idx`, `custom_cards_tags_gin_idx`, `custom_cards_rarity_idx` are listed.

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260606000001_add_custom_cards_search_indexes.sql
git commit -m "feat(db): add trigram and gin indexes for custom cards search"
```

---

## Task 2: `queryCustomCards` in `custom-cards.ts`

**Files:**

- Modify: `src/lib/supabase/custom-cards.ts`

`queryCustomCards` is the single new data-access function. It translates filter fields into Supabase query clauses, applies `.range()` for pagination, and returns `{ cards, hasMore, total }`. The two old bulk functions (`getCustomCards`, `getAllCustomCards`) are removed — they are only called from `useCustomCards`, which we rewrite in Task 3.

**Color filter strategy:**

- `include` (default) → `.overlaps('colors', colors)` (Supabase supports array overlap)
- `exact` and `atMost` → post-query JS filter on the returned page (Supabase lacks exact-array-equality; page size is 48 so cost is negligible)

**Sort mapping** (Scryfall `order` key → Supabase column):

| order         | column   | ascending default |
| ------------- | -------- | ----------------- |
| `name`        | `name`   | true              |
| `cmc`         | `cmc`    | true              |
| `rarity`      | `rarity` | true              |
| anything else | `name`   | true              |
| `dir: 'desc'` | —        | false             |

- [ ] **Step 2.1: Read the current file**

Open `src/lib/supabase/custom-cards.ts` and verify the top of the file. The `CUSTOM_CARD_SELECT` constant is on line 130. `getCustomCards` starts at line 133. `getAllCustomCards` starts at line 148.

- [ ] **Step 2.2: Replace `getCustomCards` and `getAllCustomCards` with `queryCustomCards`**

Replace the entire block from `const CUSTOM_CARD_SELECT` down to the end of the file with:

```ts
const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, display_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, variants, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist';

export interface CustomCardQueryFilters {
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
}

export interface CustomCardQuery {
	sourceId?: string | null;
	page: number;
	pageSize: number;
	filters: CustomCardQueryFilters;
}

export interface CustomCardPage {
	cards: MpcCard[];
	hasMore: boolean;
	total: number;
}

function parseCmcClause(raw: string): { op: string; value: number } | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	return { op: match[1] ?? ':', value: parseInt(match[2], 10) };
}

export async function queryCustomCards(query: CustomCardQuery): Promise<CustomCardPage> {
	const client = createClient();
	const { sourceId, page, pageSize, filters } = query;
	const offset = (page - 1) * pageSize;

	let q = client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT, { count: 'exact' })
		.eq('is_public', true);

	if (sourceId) q = q.eq('source_id', sourceId);

	if (filters.name) q = q.ilike('name', `%${filters.name}%`);
	if (filters.type) q = q.ilike('type_line', `%${filters.type}%`);
	if (filters.oracleText) q = q.ilike('oracle_text', `%${filters.oracleText}%`);
	if (filters.rarities && filters.rarities.length > 0) q = q.in('rarity', filters.rarities);
	if (filters.mpcTagsFilter && filters.mpcTagsFilter.length > 0)
		q = q.overlaps('tags', filters.mpcTagsFilter);
	if (filters.colors && filters.colors.length > 0 && filters.colorMatch === 'include')
		q = q.overlaps('colors', filters.colors);

	const cmcClause = parseCmcClause(filters.cmc ?? '');
	if (cmcClause) {
		const { op, value } = cmcClause;
		if (op === '>=') q = q.gte('cmc', value);
		else if (op === '<=') q = q.lte('cmc', value);
		else if (op === '>') q = q.gt('cmc', value);
		else if (op === '<') q = q.lt('cmc', value);
		else q = q.eq('cmc', value);
	}

	const sortColumn =
		filters.order === 'cmc' ? 'cmc' : filters.order === 'rarity' ? 'rarity' : 'name';
	const ascending = filters.dir === 'desc' ? false : true;
	q = q.order(sortColumn, { ascending }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);

	let rows = (data as CustomCardRow[]).map(rowToMpcCard);

	// Post-query color filtering for exact/atMost (Supabase lacks native exact array equality)
	if (filters.colors && filters.colors.length > 0) {
		if (filters.colorMatch === 'exact') {
			const sel = filters.colors;
			rows = rows.filter(
				(c) =>
					c.colors !== undefined &&
					c.colors.length === sel.length &&
					sel.every((col) => c.colors!.includes(col))
			);
		} else if (filters.colorMatch === 'atMost') {
			const sel = filters.colors;
			rows = rows.filter(
				(c) => c.colors === undefined || c.colors.every((col) => sel.includes(col))
			);
		}
	}

	const total = count ?? 0;
	return {
		cards: rows,
		hasMore: offset + rows.length < total,
		total,
	};
}
```

- [ ] **Step 2.3: Run type-check**

```bash
npm run check
```

Expected: no TypeScript errors. If there are errors about `getCustomCards` or `getAllCustomCards` being missing, that is expected — they will be resolved when Task 3 rewrites the hook.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/supabase/custom-cards.ts
git commit -m "feat(supabase): add queryCustomCards with server-side pagination and filters"
```

---

## Task 3: Rewrite `useCustomCards` as an infinite-scroll hook

**Files:**

- Rewrite: `src/lib/mpc/hooks/useCustomCards.ts`

This hook mirrors `useScryfallCardSearch`. It debounces filter inputs, resets to page 1 on any filter/sourceId change, appends cards on `loadMore()`, and aborts in-flight requests when new filters arrive.

The `filters` parameter type uses `SearchFilters` from `@/lib/search/types` extended with `mpcTagsFilter`. `SearchFilters` already covers `name, colors, colorMatch, type, set, rarities, oracleText, cmc, order, dir`.

**Important:** when `sourceId` is `undefined`, the hook is inactive (returns empty state, makes no requests). `null` means "no source filter, fetch all public cards". `string` means "fetch cards from that source".

- [ ] **Step 3.1: Rewrite the file**

Replace the entire content of `src/lib/mpc/hooks/useCustomCards.ts` with:

```ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { queryCustomCards } from '@/lib/supabase/custom-cards';
import { toCustomCard } from '../adapter';
import { getCustomCardSources } from '@/lib/supabase/custom-cards';
import { useDebounce } from '@/lib/search/hooks/useDebounce';
import type { CustomCard } from '../types';
import type { SearchFilters } from '@/lib/search/types';

export interface UseCustomCardsFilters extends SearchFilters {
	mpcTagsFilter: string[];
}

interface UseCustomCardsResult {
	cards: CustomCard[];
	isLoading: boolean;
	isLoadingMore: boolean;
	hasMore: boolean;
	total: number;
	error: string | null;
	loadMore: () => void;
}

const PAGE_SIZE = 48;

export function useCustomCards(
	sourceId: string | null | undefined,
	filters: UseCustomCardsFilters = {
		name: '',
		colors: [],
		colorMatch: 'include',
		type: '',
		set: '',
		rarities: [],
		oracleText: '',
		cmc: '',
		order: 'name',
		dir: 'asc',
		mpcTagsFilter: [],
	}
): UseCustomCardsResult {
	const [cards, setCards] = useState<CustomCard[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [total, setTotal] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);

	const abortRef = useRef<AbortController | null>(null);
	// Track the filter key at the time of last fetch to detect resets
	const lastFilterKeyRef = useRef<string>('');

	// Debounce text fields only; structural filters (arrays, order) apply immediately
	const debouncedName = useDebounce(filters.name, 300);
	const debouncedType = useDebounce(filters.type, 300);
	const debouncedOracleText = useDebounce(filters.oracleText, 300);
	const debouncedCmc = useDebounce(filters.cmc, 300);

	// Serialize array deps to avoid reference churn
	const colorsKey = filters.colors.join(',');
	const raritiesKey = filters.rarities.join(',');
	const tagsKey = filters.mpcTagsFilter.join(',');

	const filterKey = [
		sourceId ?? '__all__',
		debouncedName,
		colorsKey,
		filters.colorMatch,
		debouncedType,
		raritiesKey,
		debouncedOracleText,
		debouncedCmc,
		filters.order,
		filters.dir,
		tagsKey,
	].join('|');

	const fetchPage = useCallback(
		async (pageNum: number, isNewSearch: boolean) => {
			if (sourceId === undefined) return;

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			if (isNewSearch) setIsLoading(true);
			else setIsLoadingMore(true);
			setError(null);

			try {
				const [mpcCards, sources] = await Promise.all([
					queryCustomCards({
						sourceId: sourceId,
						page: pageNum,
						pageSize: PAGE_SIZE,
						filters: {
							name: debouncedName || undefined,
							colors: colorsKey ? colorsKey.split(',') : undefined,
							colorMatch: filters.colorMatch,
							type: debouncedType || undefined,
							cmc: debouncedCmc || undefined,
							rarities: raritiesKey ? raritiesKey.split(',') : undefined,
							oracleText: debouncedOracleText || undefined,
							mpcTagsFilter: tagsKey ? tagsKey.split(',') : undefined,
							order: filters.order,
							dir: filters.dir,
						},
					}),
					getCustomCardSources(),
				]);

				if (controller.signal.aborted) return;

				const sourceMap = new Map(sources.map((s) => [s.id, s]));
				const converted = mpcCards.cards.map((card) => {
					const source = (card.sourceId ? sourceMap.get(card.sourceId) : undefined) ?? {
						id: card.sourceId ?? 'user',
						name: card.sourceId ?? 'My Cards',
						isBuiltIn: false,
						tags: [],
					};
					return toCustomCard(card, source);
				});

				if (isNewSearch) {
					setCards(converted);
				} else {
					setCards((prev) => [...prev, ...converted]);
				}
				setHasMore(mpcCards.hasMore);
				setTotal(mpcCards.total);
			} catch (err) {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err.message : 'Unknown error');
			} finally {
				if (!controller.signal.aborted) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			sourceId,
			debouncedName,
			colorsKey,
			filters.colorMatch,
			debouncedType,
			raritiesKey,
			debouncedOracleText,
			debouncedCmc,
			filters.order,
			filters.dir,
			tagsKey,
		]
	);

	// Reset and fetch page 1 when filters change
	useEffect(() => {
		if (sourceId === undefined) {
			setCards([]);
			setHasMore(false);
			setTotal(0);
			setError(null);
			return;
		}
		if (filterKey !== lastFilterKeyRef.current) {
			lastFilterKeyRef.current = filterKey;
			setPage(1);
			fetchPage(1, true);
		}
	}, [filterKey, sourceId, fetchPage]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	const loadMore = useCallback(() => {
		if (!isLoading && !isLoadingMore && hasMore) {
			const next = page + 1;
			setPage(next);
			fetchPage(next, false);
		}
	}, [isLoading, isLoadingMore, hasMore, page, fetchPage]);

	return { cards, isLoading, isLoadingMore, hasMore, total, error, loadMore };
}
```

- [ ] **Step 3.2: Run type-check**

```bash
npm run check
```

Expected: no TypeScript errors. The only remaining red from Task 2 (missing `getCustomCards`/`getAllCustomCards` imports) should now be resolved since we're no longer importing them.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/mpc/hooks/useCustomCards.ts
git commit -m "feat(hooks): rewrite useCustomCards as infinite-scroll hook with server-side filters"
```

---

## Task 4: Wire the hook into the search page

**Files:**

- Modify: `src/app/search/page.tsx`

Four changes:

1. Pass `filters` argument to `useCustomCards`
2. Destructure `isLoadingMore`, `hasMore`, `loadMore` from the hook result
3. Remove `filterCollectionCards` call — filtering is now server-side
4. Build `resolvedHasMore` / `resolvedLoadMore` / `resolvedIsLoadingMore` for `CardList`

- [ ] **Step 4.1: Update the `useCustomCards` call and remove the client-side filter**

In `src/app/search/page.tsx`, replace the block:

```ts
const {
	cards: customCards,
	isLoading: customLoading,
	error: customError,
} = useCustomCards(mode === 'custom' || mode === 'all' ? customSourceId : undefined);

const filteredCustomCards = useMemo(
	() =>
		filterCollectionCards(customCards, {
			...defaultCollectionFilters,
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
		}),
	[
		customCards,
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
	]
);
```

with:

```ts
const {
	cards: customCards,
	isLoading: customLoading,
	isLoadingMore: customLoadingMore,
	hasMore: customHasMore,
	total: customTotal,
	loadMore: loadMoreCustom,
	error: customError,
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

- [ ] **Step 4.2: Update `mergedCards` to use `customCards` directly (not `filteredCustomCards`)**

Replace:

```ts
const mergedCards: AnyCard[] = useMemo(() => {
	if (mode === 'all') return [...cards, ...filteredCustomCards];
	if (mode === 'custom') return filteredCustomCards;
	return cards;
}, [mode, cards, filteredCustomCards]);
```

with:

```ts
const mergedCards: AnyCard[] = useMemo(() => {
	if (mode === 'all') return [...cards, ...customCards.filter((c) => !c.oracle_id)];
	if (mode === 'custom') return customCards;
	return cards;
}, [mode, cards, customCards]);
```

- [ ] **Step 4.3: Build resolved hasMore / loadMore / isLoadingMore**

Add this block right after `mergedCards`:

```ts
const resolvedHasMore =
	mode === 'all' ? hasMore || customHasMore : mode === 'custom' ? customHasMore : hasMore;

const resolvedLoadMore = useCallback(() => {
	if (mode === 'all') {
		if (hasMore) loadMore();
		if (customHasMore) loadMoreCustom();
	} else if (mode === 'custom') {
		loadMoreCustom();
	} else {
		loadMore();
	}
}, [mode, hasMore, customHasMore, loadMore, loadMoreCustom]);

const resolvedIsLoadingMore =
	mode === 'all'
		? isLoadingMore || customLoadingMore
		: mode === 'custom'
			? customLoadingMore
			: isLoadingMore;
```

- [ ] **Step 4.4: Update the result info bar to use `customTotal` instead of `filteredCustomCards.length`**

Replace:

```ts
{
	filteredCustomCards.length > 0 && ` · ${filteredCustomCards.length} custom`;
}
```

with:

```ts
{
	customTotal > 0 && ` · ${customTotal} custom`;
}
```

And replace:

```ts
{
	mode === 'custom' && `${filteredCustomCards.length} custom`;
}
```

with:

```ts
{
	mode === 'custom' && `${customTotal} custom`;
}
```

- [ ] **Step 4.5: Pass resolved props to `<CardList>` and remove `pageSize={false}`**

Replace the `<CardList>` props:

```ts
				<CardList
					cards={mergedCards}
					isLoading={isLoading}
					isLoadingMore={isLoadingMore}
					hasMore={hasMore}
					onLoadMore={loadMore}
					onCardClick={handleCardClick}
					renderOverlay={withCustomBadge}
					sortOrder={order}
					sortDir={dir}
					onSortChange={(newOrder, newDir) => {
						setOrder(newOrder as Parameters<typeof setOrder>[0]);
						setDir(newDir);
					}}
					pageSize={false}
					tableColumns={tableColumns}
				/>
```

with:

```ts
				<CardList
					cards={mergedCards}
					isLoading={isLoading || customLoading}
					isLoadingMore={resolvedIsLoadingMore}
					hasMore={resolvedHasMore}
					onLoadMore={resolvedLoadMore}
					onCardClick={handleCardClick}
					renderOverlay={withCustomBadge}
					sortOrder={order}
					sortDir={dir}
					onSortChange={(newOrder, newDir) => {
						setOrder(newOrder as Parameters<typeof setOrder>[0]);
						setDir(newDir);
					}}
					pageSize={false}
					tableColumns={tableColumns}
				/>
```

- [ ] **Step 4.6: Remove unused imports**

Remove from the import block:

- `filterCollectionCards` and `defaultCollectionFilters` from `@/app/collection/utils/filterCollectionCards` (no longer used)

- [ ] **Step 4.7: Run type-check and lint**

```bash
npm run check
```

Expected: clean. If there are errors about `filteredCustomCards` still being referenced, search the file for any remaining uses and update them to `customCards`.

- [ ] **Step 4.8: Commit**

```bash
git add src/app/search/page.tsx
git commit -m "feat(search): wire server-side paginated custom cards into search page"
```

---

## Task 5: Manual verification

This is a UI feature — verify it works in the running app.

- [ ] **Step 5.1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 5.2: Verify mode=custom**

1. Navigate to `/search`
2. Switch to "Custom" mode via the mode switcher
3. Confirm cards load (first 48 appear, spinner shows while loading)
4. Scroll to the bottom — confirm more cards load and append
5. Type a name in the search bar — confirm results reset to matching cards only
6. Clear the search — confirm all cards return

- [ ] **Step 5.3: Verify mode=official**

1. Switch to "Official" mode
2. Confirm Scryfall cards still load and paginate normally
3. Confirm no errors in the browser console related to custom cards

- [ ] **Step 5.4: Verify mode=all**

1. Switch to "All" mode
2. Confirm Scryfall cards appear first, followed by custom cards without `oracle_id`
3. Confirm cards with `oracle_id` (Scryfall variants) do NOT appear in the custom section
4. Scroll to bottom — confirm both Scryfall and custom pagination continue

- [ ] **Step 5.5: Verify filters in mode=custom**

1. In "Custom" mode, open Filters
2. Apply a color filter — confirm cards refresh to matching only
3. Apply a tag filter (`mpcTagsFilter`) — confirm only matching tags appear
4. Change sort order — confirm list reorders

- [ ] **Step 5.6: Run the full check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 5.7: Commit if any fixups were needed**

```bash
git add -p
git commit -m "fix(search): custom cards pagination fixups from manual testing"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                                 | Task                 |
| ---------------------------------------------------------------- | -------------------- |
| `pg_trgm` extension + 4 new indexes                              | Task 1               |
| `queryCustomCards` with pagination, all filter clauses, sort     | Task 2               |
| `exact`/`atMost` post-query color filter                         | Task 2, step 2.2     |
| `count: 'exact'` for total, `hasMore` calculation                | Task 2, step 2.2     |
| `getCustomCardSources`/`getCustomCardSourcesWithCount` unchanged | Task 2 (not touched) |
| `useCustomCards` debounced, page state, loadMore, abort          | Task 3               |
| Hook inactive when `sourceId === undefined`                      | Task 3, step 3.1     |
| Search page: filters passed to hook                              | Task 4               |
| Search page: `filterCollectionCards` removed                     | Task 4               |
| Mode `all`: `customCards.filter(c => !c.oracle_id)`              | Task 4               |
| Mode `all`: both `hasMore`/`loadMore` combined                   | Task 4               |
| `isLoading` shows both sources loading                           | Task 4               |
| Result count shows `customTotal`                                 | Task 4               |

All spec requirements covered. ✓

**Notes:**

- `CustomCard` uses `oracle_id` (snake_case from Scryfall spread), not `oracleId` — Task 4 uses `c.oracle_id` which is correct per `adapter.ts` line 9.
- `getCustomCardSources` is called inside `fetchPage` on every page load to build the source map. This is a small extra query per page; acceptable given sources are few in number. Future optimization: cache sources separately.
- `set` filter from `SearchFilters` is not pushed to Supabase (custom cards use `set_code` internally; the Scryfall `set` shorthand matches `set_code` in the DB). The filter is silently ignored for now — custom cards have sparse `set_code` data.
