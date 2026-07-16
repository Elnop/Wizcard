# Hide Unmatched Custom Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom cards with no matching official card (`oracle_id IS NULL`) never appear anywhere on the site.

**Architecture:** Enforce `oracle_id IS NOT NULL` as a hard, non-bypassable filter at the single query layer (`src/lib/supabase/queries/custom-cards.ts` + its server twin) that feeds every custom-card surface: the search list, per-source counts, prints on official card pages, and direct-URL card access. Then remove the now-dead user-facing `oracleIdFilter` control and its plumbing. No DB migration, no RLS change, no data deletion — unmatched rows stay in the table, just hidden.

**Tech Stack:** Next.js (App Router), TypeScript, React, Supabase JS client. No test framework (see Global Constraints).

## Global Constraints

- **No test framework** — the project has no vitest/jest. The "test cycle" for every task is `npm run check` (TypeScript + ESLint + Prettier) plus runtime verification in the dev app. Do NOT write `.test.ts` files.
- **`npm run check` baseline is RED** — ~60 pre-existing problems exist in unrelated files. The gate is "no NEW problems in the files you touched", verified with `npx eslint <changed files>`, never "check is fully green".
- **Supabase filter idiom** — a NULL-exclusion filter is written `.not('oracle_id', 'is', null)` on a query builder `q`.
- **Commit trailer** — end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Work happens on branch `feat/hide-unmatched-custom-cards` (already checked out; the design spec is already committed there).

---

### Task 1: Hard-filter unmatched cards in the query layer

Enforce `oracle_id IS NOT NULL` on the two client-side custom-card queries (list + per-source counts) and the server-side by-id fetch. This is the core behavior change; all display surfaces route through these three functions.

**Files:**

- Modify: `src/lib/supabase/queries/custom-cards.ts` — `queryCustomCardRows` (after the `.eq('is_public', true)` at line ~128) and `fetchCustomCardSourceRowsWithCounts` (the count query at line ~97).
- Modify: `src/lib/supabase/queries/custom-cards.server.ts` — `fetchCustomCardRowById` (the `.eq('id', id)` query at line ~11).

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: no new symbols. Behavior contract for later tasks: `queryCustomCardRows`, `fetchCustomCardSourceRowsWithCounts`, and `fetchCustomCardRowById` now return ONLY rows where `oracle_id IS NOT NULL`, regardless of `filters.oracleIdFilter`.

- [ ] **Step 1: Add the hard filter to `queryCustomCardRows`**

In `src/lib/supabase/queries/custom-cards.ts`, find:

```ts
let q = client
	.from('custom_cards')
	.select(CUSTOM_CARD_SELECT, { count: 'exact' })
	.eq('is_public', true);
```

Replace with:

```ts
let q = client
	.from('custom_cards')
	.select(CUSTOM_CARD_SELECT, { count: 'exact' })
	.eq('is_public', true)
	// Hard invariant: unmatched custom cards (no official match) are never listed.
	.not('oracle_id', 'is', null);
```

- [ ] **Step 2: Add the hard filter to the per-source count query**

In the same file, in `fetchCustomCardSourceRowsWithCounts`, find:

```ts
		client.from('custom_cards').select('source_id').eq('is_public', true),
```

Replace with:

```ts
		client
			.from('custom_cards')
			.select('source_id')
			.eq('is_public', true)
			.not('oracle_id', 'is', null),
```

- [ ] **Step 3: Add the hard filter to `fetchCustomCardRowById`**

In `src/lib/supabase/queries/custom-cards.server.ts`, find:

```ts
const { data, error } = await client
	.from('custom_cards')
	.select(CUSTOM_CARD_SELECT)
	.eq('id', id)
	.single();
if (error || !data) return null;
```

Replace with:

```ts
const { data, error } = await client
	.from('custom_cards')
	.select(CUSTOM_CARD_SELECT)
	.eq('id', id)
	// Unmatched custom cards 404 even via direct URL, consistent with never being listed.
	.not('oracle_id', 'is', null)
	.single();
if (error || !data) return null;
```

- [ ] **Step 4: Typecheck/lint the changed query files**

Run: `npx eslint src/lib/supabase/queries/custom-cards.ts src/lib/supabase/queries/custom-cards.server.ts && npx tsc --noEmit`
Expected: no NEW eslint problems in these two files; `tsc` reports no errors introduced by this change (pre-existing unrelated errors elsewhere are acceptable per Global Constraints — confirm none reference these two files).

- [ ] **Step 5: Runtime-verify hiding + 404**

Start the app (`npm run dev`, or reuse a running instance) and verify:

1. `/search?mode=custom` (or the custom search mode toggle) lists only cards; sanity-check via Supabase Studio that at least one `is_public=true, oracle_id IS NULL` row exists and confirm it does NOT appear.
2. Open the URL of that unmatched card directly (`/card/<its id>`) → the not-found page renders.
3. A source that in Studio has public rows only with `oracle_id IS NULL` does not appear in the source list / its count is 0.

Record what you observed (which card id you tested, that it 404'd).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/queries/custom-cards.ts src/lib/supabase/queries/custom-cards.server.ts
git commit -m "$(cat <<'EOF'
feat(custom-cards): hide cards with no official match everywhere

Enforce oracle_id IS NOT NULL as a hard filter in the custom-card query
layer (list, per-source counts, by-id fetch). Unmatched custom cards stay
in the DB but are never listed and 404 on direct URL access.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Remove the dead `oracleIdFilter` UI control and its plumbing

With Task 1 in place, `oracleIdFilter` can no longer change results (everything is forced to `defined`). Remove the control from the FilterModal and delete the `oracleIdFilter` field from every layer that carried it, so no misleading dead filter is exposed. The distinct exact-match `oracleId` filter (used by prints) is NOT touched.

**Files:**

- Delete: `src/lib/search/components/filters/OracleIdFilter/OracleIdFilter.tsx`
- Delete: `src/lib/search/components/filters/OracleIdFilter/OracleIdFilter.module.css`
- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx` (lines ~23–24 imports, ~50 prop, ~67 onApply field, ~90/~114 initial prop, ~143–144 draft state, ~164 onApply pass, ~182 reset, ~257 render, ~294/~322 default+wiring)
- Modify: `src/app/[locale]/search/page.tsx` (line ~91 destructure, ~156 pass to useCustomCards, ~189 count, ~192 total, ~269 FilterModal prop)
- Modify: `src/app/[locale]/search/useSearchFiltersFromUrl.ts` (import of `OracleIdFilterValue`, lines ~104 & ~164 type fields, ~144 param write, ~204–208 state, ~243 & ~266 sync-effect refs, ~286 apply, ~324 return)
- Modify: `src/lib/mpc/hooks/useCustomCards.ts` (line ~13 filter field, ~70 default, ~87 & ~120 & ~174 usage)
- Modify: `src/lib/supabase/queries/custom-cards.ts` (line ~66 `oracleIdFilter` in `CustomCardQueryFilters`, lines ~142–143 the two branches)

**Interfaces:**

- Consumes: the Task 1 behavior contract (hard filter is what makes this control dead).
- Produces: `CustomCardQueryFilters` no longer has an `oracleIdFilter` field; `SearchFilters` and the FilterModal `onApply` payload no longer have `oracleIdFilter`. The exact-match `oracleId?: string` field on `CustomCardQueryFilters` remains.

- [ ] **Step 1: Delete the OracleIdFilter component files**

```bash
git rm src/lib/search/components/filters/OracleIdFilter/OracleIdFilter.tsx \
       src/lib/search/components/filters/OracleIdFilter/OracleIdFilter.module.css
```

- [ ] **Step 2: Remove `oracleIdFilter` from the query filter contract**

In `src/lib/supabase/queries/custom-cards.ts`, in `CustomCardQueryFilters`, delete the line:

```ts
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
```

Then in `queryCustomCardRows`, delete these two lines:

```ts
if (filters.oracleIdFilter === 'defined') q = q.not('oracle_id', 'is', null);
else if (filters.oracleIdFilter === 'undefined') q = q.is('oracle_id', null);
```

Leave the exact-match line intact:

```ts
if (filters.oracleId) q = q.eq('oracle_id', filters.oracleId);
```

- [ ] **Step 3: Remove `oracleIdFilter` from `useCustomCards`**

In `src/lib/mpc/hooks/useCustomCards.ts`:

Delete the interface field (line ~13):

```ts
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
```

Delete the default (line ~70):

```ts
const oracleIdFilter = filters.oracleIdFilter ?? 'all';
```

Remove `oracleIdFilter` from the dependency/derived list around line ~87 (delete the standalone `oracleIdFilter,` entry).

Delete the pass-through into `queryCustomCards` around line ~120:

```ts
						oracleIdFilter: oracleIdFilter !== 'all' ? oracleIdFilter : undefined,
```

Remove the `oracleIdFilter,` entry from the hook's dependency array / return around line ~174.

After editing, grep the file to confirm zero remaining matches:
Run: `grep -n oracleIdFilter src/lib/mpc/hooks/useCustomCards.ts`
Expected: no output.

- [ ] **Step 4: Remove `oracleIdFilter` from `useSearchFiltersFromUrl`**

In `src/app/[locale]/search/useSearchFiltersFromUrl.ts`:

- Remove the `OracleIdFilterValue` import (the line importing it from the now-deleted `OracleIdFilter` component).
- Delete `oracleIdFilter: OracleIdFilterValue;` from the `UrlSyncState` type (~line 104) and from the `SearchFilters` type (~line 164).
- In `buildSearchParams`, delete: `if (state.oracleIdFilter !== 'all') params.set('oracleId', state.oracleIdFilter);` (~line 144).
- Delete the state hook (~lines 204–208):

```ts
const [oracleIdFilter, setOracleIdFilter] = useState<OracleIdFilterValue>(() => {
	const raw = searchParams.get('oracleId');
	if (raw === 'defined' || raw === 'undefined') return raw;
	return 'all';
});
```

- Remove the `oracleIdFilter,` entry from the `buildSearchParams({ ... })` call object (~line 243) and from the effect dependency array (~line 266).
- In `applyFilters`, delete: `setOracleIdFilter(filters.oracleIdFilter);` (~line 286).
- Remove the `oracleIdFilter,` entry from the hook's returned object (~line 324).

After editing, confirm:
Run: `grep -n -i oracleid src/app/[locale]/search/useSearchFiltersFromUrl.ts`
Expected: no output.

- [ ] **Step 5: Remove `oracleIdFilter` from `FilterModal`**

In `src/lib/search/components/FilterModal/FilterModal.tsx`:

- Delete both import lines for `OracleIdFilter` and `OracleIdFilterValue` (~lines 23–24).
- Delete `oracleIdFilter?: OracleIdFilterValue;` from the outer props interface (~line 50).
- Delete `oracleIdFilter: OracleIdFilterValue;` from the `onApply` payload type (~line 67).
- Delete `initialOracleIdFilter: OracleIdFilterValue;` from the inner component's props type (~line 90) and remove `initialOracleIdFilter,` from that component's destructured params (~line 114).
- Delete the draft state (~lines 143–144):

```ts
const [draftOracleIdFilter, setDraftOracleIdFilter] =
	useState<OracleIdFilterValue>(initialOracleIdFilter);
```

- Remove `oracleIdFilter: draftOracleIdFilter,` from the `onApply({ ... })` object (~line 164).
- Remove `setDraftOracleIdFilter('all');` from `handleReset` (~line 182).
- Delete the render line (~line 257):

```tsx
<OracleIdFilter value={draftOracleIdFilter} onChange={setDraftOracleIdFilter} />
```

If that line is the only child of a wrapping fragment/row that now renders nothing, remove the empty wrapper too (inspect surrounding JSX before deleting).

- In the outer wrapper component, remove the `oracleIdFilter = 'all',` default param (~line 294) and the `initialOracleIdFilter={oracleIdFilter}` prop pass to the inner component (~line 322).

After editing, confirm:
Run: `grep -n -i oracleid src/lib/search/components/FilterModal/FilterModal.tsx`
Expected: no output.

- [ ] **Step 6: Remove `oracleIdFilter` from the search page**

In `src/app/[locale]/search/page.tsx`:

- Remove `oracleIdFilter,` from the `useSearchFiltersFromUrl()` destructure (~line 91).
- In the `useCustomCards(...)` options object, delete: `oracleIdFilter: isBacks ? 'all' : oracleIdFilter,` (~line 156).
- Delete: `const oracleIdFilterCount = oracleIdFilter !== 'all' ? 1 : 0;` (~line 189).
- Change the total-count expression (~lines 190–192) from:

```ts
const totalActiveFilterCount = isBacks
	? customFilterCount
	: activeFilterCount + customFilterCount + oracleIdFilterCount;
```

to:

```ts
const totalActiveFilterCount = isBacks ? customFilterCount : activeFilterCount + customFilterCount;
```

- Remove the `oracleIdFilter={oracleIdFilter}` prop from the `<FilterModal ... />` usage (~line 269).

After editing, confirm:
Run: `grep -n -i oracleidfilter src/app/[locale]/search/page.tsx`
Expected: no output.

- [ ] **Step 7: Full typecheck + lint of touched files**

Run: `npx tsc --noEmit`
Expected: no errors that reference any file touched in Tasks 1–2 (in particular, no "Cannot find module '.../OracleIdFilter'" and no "property 'oracleIdFilter' does not exist"). Pre-existing unrelated errors are acceptable.

Run: `npx eslint src/lib/search/components/FilterModal/FilterModal.tsx src/app/[locale]/search/page.tsx src/app/[locale]/search/useSearchFiltersFromUrl.ts src/lib/mpc/hooks/useCustomCards.ts src/lib/supabase/queries/custom-cards.ts`
Expected: no NEW problems in these files.

Also confirm nothing else still imports the deleted component:
Run: `grep -rn "OracleIdFilter" src/`
Expected: no output.

- [ ] **Step 8: Runtime-verify the UI**

In the dev app, open the search FilterModal in custom mode:

1. The "Oracle ID" control is gone.
2. Applying/resetting filters works without error (no console errors).
3. The active-filter count badge behaves normally.
4. Load a legacy URL with `&oracleId=undefined` → it is ignored, and only matched cards show (the param is harmless dead text).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(search): remove dead oracleIdFilter control

The oracleIdFilter user filter can no longer change results now that
unmatched custom cards are hidden at the query layer. Remove the control
and its plumbing across FilterModal, search page, URL sync, useCustomCards,
and the query filter contract. The exact-match oracleId filter (used by
prints) is unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage** — every spec section maps to a task:

- Hard filter in `queryCustomCardRows` → Task 1 Step 1.
- Hard filter in `fetchCustomCardSourceRowsWithCounts` → Task 1 Step 2.
- 404 on direct URL via `fetchCustomCardRowById` → Task 1 Step 3.
- Remove `oracleIdFilter` UI + plumbing (component, FilterModal, search page, useSearchFiltersFromUrl, useCustomCards, query contract) → Task 2 Steps 1–6.
- "Don't touch": no migration/RLS/data changes (none in plan); ingestion untouched (none in plan); exact-match `oracleId` preserved (Task 2 Step 2 explicitly keeps it).
- Verification list → Task 1 Step 5 + Task 2 Step 8.

**Placeholder scan** — no TBD/TODO; every code step shows exact before/after; no "handle edge cases".

**Type consistency** — `oracleIdFilter` is removed symmetrically from `CustomCardQueryFilters` (Task 2 Step 2), the `useCustomCards` filter arg (Step 3), `SearchFilters`/`UrlSyncState` (Step 4), FilterModal props + `onApply` payload (Step 5), and the search-page destructure/pass (Step 6) — no layer references it after removal. The exact-match `oracleId?: string` field is consistently preserved across Task 1 and Task 2. The `.not('oracle_id', 'is', null)` idiom is identical in all three Task 1 sites.
