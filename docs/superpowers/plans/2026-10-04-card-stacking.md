# Configurable Card Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose, per list (collection, wishlist, deck), which copy properties split card stacks — name always, plus print / finish / condition / language / flags — or turn stacking off, persisted in the profile.

**Architecture:** One pure key function (`stackKeyOf`) + `groupByStack` replace the hard-coded `groupByOracleId`; stacking still runs on the in-memory facets index before paging. A `useStackBy(list)` hook is the single read/write point (profile column when signed in, localStorage when not). A `StackByMenu` popover is injected into `CardList` through a new `toolbarExtra` slot. The deck keeps its oracle-level `groupByCardId` and stacks only inside each zone section.

**Tech Stack:** Next.js 16 / React 19 client components, Zustand stores, next-intl, Supabase (Postgres migration), CSS modules. Pure-function tests run with `npx tsx --test` (tsx is already a devDependency — **no new dependency**).

**Spec:** `docs/superpowers/specs/2026-10-04-card-stacking-design.md`

## Global Constraints

- Default stacking is `[]` = by name, and must reproduce **exactly** today's behaviour on every screen.
- `StackBy = StackCriterion[] | 'copy'`; `StackCriterion = 'print' | 'finish' | 'condition' | 'language' | 'flags'`.
- Key segments are appended in the fixed order print, finish, condition, language, flags — independent of array order.
- Defaults: finish `'nonfoil'`, condition `'NM'`, language = print language, flags = all false.
- DB: typed `text[] not null default '{}'::text[]` columns — no jsonb. Constraint names `profiles_collection_stack_by_check`, `profiles_wishlist_stack_by_check`, `profiles_deck_stack_by_check`.
- localStorage key `wizcard-stack-by-<list>` (hyphen style, like `wizcard-collection`); every read/write wrapped in try/catch.
- Supabase client calls stay in `src/lib/profile/db/profiles.ts` (already the profile row↔domain module).
- Always `triggerSync()` after `enqueue()` (already done inside `updateProfile`).
- `npm run check` is red at base (~60 pre-existing problems): gate every task on **no new problems** in the changed files: `npx eslint <files>` + `npx tsc --noEmit -p .` (filter output to changed files).
- `npm run sb:reset` is destructive — do **not** run it; use `npm run sb:migrate`.
- Before Task 1 record the base: `BASE=$(git rev-parse HEAD)` — Task 9 diffs against it.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. **Two stacks sharing one representative print** (same Sol Ring printing, foil vs non-foil, under "Nom + Finition") — click, context menu, `xN` badge and table qty must each resolve their own stack (collection, wishlist, deck). Pinned by the `filterStacks` test in Task 1 and the rowId lookups in Tasks 5 and 6.
2. **Copy with no `condition` / `language` / `isFoil` set** must stack with an explicit NM / print-language / non-foil copy, not form a ghost stack. Pinned in Task 1 tests.
3. **Corrupt or foreign stored value** (`'{copy,print}'` in DB, `"garbage"` or `["foo"]` in localStorage, localStorage throwing in private mode) must fall back to by-name, never crash. Pinned in Task 2 tests + DB CHECK test.
4. **Deck tokens panel** shares `renderOverlay` / `handleCardClick` with the main sections but is NOT stacked — its overlay and selection must still work (stack lookup must cover every copy rowId, including tokens). Pinned in Task 6/7/8 browser checks.
5. **Switching stacking with a deck selection active** must clear the selection (stale keys would silently select nothing or the wrong copies). Pinned in Task 8.

---

## Phase 1 — domain, persistence, collection, wishlist

### Task 1: Stack key, `groupByStack`, `CardStack.key`, filterStacks collision fix

**Files:**

- Modify: `src/types/cards.ts` (`CardStack`, `FacetStack`, add `StackCriterion`, `StackBy`)
- Modify: `src/lib/card/utils/group-cards.ts`
- Modify: `src/lib/collection-index/page-window.ts:31`
- Modify: `src/lib/collection-index/hooks/useIndexedCollection.ts:8,44` (rename call only)
- Modify: `src/lib/collection/hooks/useCollectionCards.ts:10,92` (rename call only)
- Modify: `src/app/[locale]/collection/lib/ImportModal/hooks/useImportPreviewState.ts:9,69` (rename call only)
- Modify: `src/app/[locale]/collection/lib/CollectionView/useCollectionFiltering.ts:13`
- Modify: `src/contexts/CardModalProvider.tsx:388`
- Modify: `AGENTS.md` (pitfall line 7, ID Concepts `oracleId` line)
- Test: `src/lib/card/utils/group-cards.test.ts`

**Interfaces:**

- Produces: `StackCriterion`, `StackBy` (from `@/types/cards`); `STACK_CRITERIA: readonly StackCriterion[]`, `stackKeyOf(copy, stackBy): string`, `groupByStack<T extends FacetCopy>(cards: T[], stackBy?: StackBy): StackOf<T>[]` (from `@/lib/card/utils/group-cards`); `CardStack.key` / `FacetStack.key` (replaces `oracleId`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/card/utils/group-cards.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry, FacetCopy } from '@/types/cards';
import { groupByStack, stackKeyOf, filterStacks } from '@/lib/card/utils/group-cards';
import { defaultCollectionFilters } from '@/lib/card/utils/filterCollectionCards';

let n = 0;
function copy(
	over: { id?: string; oracle_id?: string; name?: string; lang?: string } = {},
	entry: Partial<CardEntry> = {}
): FacetCopy {
	n += 1;
	return {
		id: over.id ?? 'print-a',
		oracle_id: over.oracle_id ?? 'oracle-sol-ring',
		name: over.name ?? 'Sol Ring',
		lang: over.lang ?? 'en',
		layout: 'normal',
		set: 'c21',
		collector_number: '263',
		rarity: 'uncommon',
		released_at: '2021-04-23',
		artist: 'Mike Bierek',
		promo: false,
		digital: false,
		cmc: 1,
		colors: [],
		color_identity: [],
		type_line: 'Artifact',
		oracle_text: '{T}: Add {C}{C}.',
		entry: { rowId: `row-${n}`, dateAdded: `2026-01-0${(n % 9) + 1}T00:00:00Z`, ...entry },
	} as FacetCopy;
}

test('by name (default) groups all prints of a card together', () => {
	const stacks = groupByStack([copy({ id: 'print-a' }), copy({ id: 'print-b' })]);
	assert.equal(stacks.length, 1);
	assert.equal(stacks[0].cards.length, 2);
	assert.equal(stacks[0].key, 'oracle-sol-ring');
});

test('print criterion splits by printing', () => {
	const stacks = groupByStack([copy({ id: 'print-a' }), copy({ id: 'print-b' })], ['print']);
	assert.equal(stacks.length, 2);
});

test('finish: unset isFoil stacks with explicit non-foil; foil and etched split', () => {
	const stacks = groupByStack(
		[
			copy({}, {}),
			copy({}, { isFoil: false }),
			copy({}, { isFoil: true }),
			copy({}, { isFoil: true, foilType: 'etched' }),
		],
		['finish']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1, 1]
	);
});

test('condition: unset stacks with NM', () => {
	const stacks = groupByStack(
		[copy({}, {}), copy({}, { condition: 'NM' }), copy({}, { condition: 'LP' })],
		['condition']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1]
	);
});

test('language: unset entry language falls back to the print language', () => {
	const stacks = groupByStack(
		[copy({ lang: 'fr' }, {}), copy({}, { language: 'fr' }), copy({}, { language: 'de' })],
		['language']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1]
	);
});

test('flags: proxy/alter/forTrade combination splits, absent = false', () => {
	const stacks = groupByStack(
		[
			copy({}, {}),
			copy({}, { proxy: false }),
			copy({}, { proxy: true }),
			copy({}, { alter: true }),
		],
		['flags']
	);
	assert.deepEqual(
		stacks.map((s) => s.cards.length),
		[2, 1, 1]
	);
});

test('criteria order does not change the key', () => {
	const c = copy({}, { isFoil: true, condition: 'LP' });
	assert.equal(stackKeyOf(c, ['finish', 'condition']), stackKeyOf(c, ['condition', 'finish']));
});

test("'copy' gives one stack per physical copy", () => {
	const a = copy();
	const b = copy();
	const stacks = groupByStack([a, b], 'copy');
	assert.equal(stacks.length, 2);
	assert.equal(stacks[0].key, a.entry.rowId);
});

test('different cards never stack together, whatever the criteria', () => {
	const stacks = groupByStack(
		[copy(), copy({ oracle_id: 'oracle-other', name: 'Arcane Signet' })],
		[]
	);
	assert.equal(stacks.length, 2);
});

test('filterStacks keeps two stacks of the same card (no oracle collision)', () => {
	const stacks = groupByStack(
		[copy({}, { isFoil: true }), copy({}, { isFoil: false })],
		['finish']
	);
	const filtered = filterStacks(stacks, defaultCollectionFilters);
	assert.equal(filtered.length, 2);
	assert.notEqual(filtered[0].key, filtered[1].key);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/card/utils/group-cards.test.ts`
Expected: FAIL — `groupByStack` / `stackKeyOf` are not exported.

- [ ] **Step 3: Add the domain types**

In `src/types/cards.ts`, replace the `CardStack` and `FacetStack` interfaces:

```ts
/** A copy property that, on top of the card name, splits stacks apart. */
export type StackCriterion = 'print' | 'finish' | 'condition' | 'language' | 'flags';
/** [] = by name (default); 'copy' = no stacking (one tile per physical copy). */
export type StackBy = StackCriterion[] | 'copy';

// Copies grouped under one tile. By default all copies of the same card (any
// edition); finer per the user's StackBy setting.
export interface CardStack {
	key: string; // stable grouping key (see stackKeyOf)
	name: string; // display name (from first card in stack)
	cards: CardCopy[]; // copies — may be different editions
}
```

```ts
export interface FacetStack {
	key: string;
	name: string;
	cards: FacetCopy[];
}
```

- [ ] **Step 4: Implement `stackKeyOf` / `groupByStack` and fix `filterStacks`**

In `src/lib/card/utils/group-cards.ts`:

1. Change the import line to `import type { FacetCopy, StackBy, StackCriterion } from '@/types/cards';`
2. Change `type StackOf<T> = { oracleId: string; name: string; cards: T[] };` to `type StackOf<T> = { key: string; name: string; cards: T[] };`
3. After `cardGroupKey`, add:

```ts
/** Every criterion, in the fixed order its key segment is appended. */
export const STACK_CRITERIA: readonly StackCriterion[] = [
	'print',
	'finish',
	'condition',
	'language',
	'flags',
];

function segment(copy: FacetCopy, criterion: StackCriterion): string {
	const { entry } = copy;
	switch (criterion) {
		case 'print':
			return copy.id;
		case 'finish':
			if (!entry.isFoil) return 'nonfoil';
			return entry.foilType === 'etched' ? 'etched' : 'foil';
		case 'condition':
			return entry.condition ?? 'NM';
		case 'language':
			return entry.language ?? ('lang' in copy && copy.lang ? copy.lang : 'en');
		case 'flags':
			return `${entry.proxy ? 1 : 0}${entry.alter ? 1 : 0}${entry.forTrade ? 1 : 0}`;
	}
}

/**
 * Stack key of a copy: the logical card (cardGroupKey) plus one segment per
 * selected criterion, in STACK_CRITERIA order so the array order is irrelevant.
 * Missing values get explicit defaults so "unset" stacks with the default.
 * 'copy' disables stacking: the key is the physical copy's rowId.
 */
export function stackKeyOf(copy: FacetCopy, stackBy: StackBy): string {
	if (stackBy === 'copy') return copy.entry.rowId;
	let key = cardGroupKey(copy);
	for (const criterion of STACK_CRITERIA) {
		if (stackBy.includes(criterion)) key += `|${segment(copy, criterion)}`;
	}
	return key;
}
```

4. Rename `groupByOracleId` → `groupByStack`, update its doc comment's first sentence to "Groups copies into stacks keyed by `stackKeyOf(copy, stackBy)` (default: by name).", and change its signature + key line + return:

```ts
export function groupByStack<T extends FacetCopy>(cards: T[], stackBy: StackBy = []): StackOf<T>[] {
	const map = new Map<string, T[]>();
	const order: string[] = [];
	for (const card of cards) {
		const key = stackKeyOf(card, stackBy);
```

and `return { key, name: ordered[0].name, cards: ordered };`

5. In `filterStacks`, replace the oracle lookup:

```ts
// Map each surviving representative back to its stack by identity (rowId):
// several stacks can share one oracle_id once stacking is finer than by-name.
const stackByRepRowId = new Map(
	assignmentFiltered.map((s) => [s.cards[0]?.entry.rowId, s] as const)
);
const { order, dir } = filters;

const ordered = filtered
	.map((rep) => stackByRepRowId.get(rep.entry.rowId))
	.filter((s): s is StackOf<T> => Boolean(s));
```

(`filterCollectionCards` returns the same representative objects it was given, so `rep.entry.rowId` is the stack's `cards[0].entry.rowId`.) If `cardGroupKey` is no longer used in `filterStacks`, keep it exported — `stackKeyOf` and other modules use it.

- [ ] **Step 5: Rename the remaining `oracleId` stack sites**

- `src/lib/collection-index/page-window.ts:31`: `return { key: stack.key, name: stack.name, cards: full };`
- `src/lib/collection-index/hooks/useIndexedCollection.ts`: import `groupByStack` instead of `groupByOracleId`; line 44 `const grouped = groupByStack(copies);` (stackBy wiring comes in Task 5).
- `src/lib/collection/hooks/useCollectionCards.ts`: import + `groupByStack(cards)`.
- `src/app/[locale]/collection/lib/ImportModal/hooks/useImportPreviewState.ts`: import + `groupByStack(activeCards)`.
- `src/app/[locale]/collection/lib/CollectionView/useCollectionFiltering.ts:13`: `S extends { key: string; name: string; cards: FacetCopy[] },`
- `src/contexts/CardModalProvider.tsx:388`: `const stack: CardStack = { key: oracleKeyOf(rep), name: rep.name, cards: stackCards };`

Then run `npx tsc --noEmit -p . 2>&1 | grep -E "oracleId|groupByOracleId"` — expected: no output. Fix any remaining hit the same way (rename field to `key`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --test src/lib/card/utils/group-cards.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 7: Update AGENTS.md**

Replace the pitfall bullet (line 7):

```md
- **Don't hand-roll display grouping** — stacks come from `groupByStack(copies, stackBy)` (`src/lib/card/utils/group-cards.ts`). Default `stackBy = []` groups by card (oracle_id: two editions = one `CardStack`); finer criteria are a user setting (`useStackBy`). Look stacks up by the representative's `entry.rowId`, never by print id — several stacks can share one print.
```

and the ID Concepts line for `oracleId`:

```md
- **`oracleId`** — identifies the abstract card concept across all editions; the base of every stack key (`CardStack.key`)
```

- [ ] **Step 8: Static gate + commit**

Run: `npx eslint src/types/cards.ts src/lib/card/utils/group-cards.ts src/lib/card/utils/group-cards.test.ts src/lib/collection-index src/lib/collection/hooks/useCollectionCards.ts "src/app/[locale]/collection/lib" src/contexts/CardModalProvider.tsx` and `npx tsc --noEmit -p .` — no new problems in these files.

```bash
git add -A src/types/cards.ts src/lib/card/utils src/lib/collection-index src/lib/collection/hooks/useCollectionCards.ts "src/app/[locale]/collection/lib" src/contexts/CardModalProvider.tsx AGENTS.md
git commit -m "feat(stacking): stack key + groupByStack, CardStack.key, rowId-based filterStacks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: DB columns + profile mapping

**Files:**

- Create: `supabase/migrations/20261004120000_add_profile_stack_by.sql`
- Modify: `supabase/verify_schema.sql` (columns list ~line 166, defaults ~line 217, CHECK list ~line 430)
- Create: `src/lib/card/utils/stack-by.ts`
- Test: `src/lib/card/utils/stack-by.test.ts`
- Modify: `src/lib/profile/types.ts`, `src/lib/profile/db/profiles.ts`, `src/lib/profile/store/profile-store.ts`

**Interfaces:**

- Consumes: `StackBy`, `STACK_CRITERIA` (Task 1).
- Produces: `stackByFromArray(value: unknown): StackBy`, `stackByToArray(value: StackBy): string[]` (from `@/lib/card/utils/stack-by`); `Profile.collectionStackBy | wishlistStackBy | deckStackBy: StackBy`, same keys accepted in `ProfileUpdate`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/card/utils/stack-by.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackByFromArray, stackByToArray } from '@/lib/card/utils/stack-by';

test('empty / non-array / garbage → by name', () => {
	assert.deepEqual(stackByFromArray([]), []);
	assert.deepEqual(stackByFromArray(null), []);
	assert.deepEqual(stackByFromArray('garbage'), []);
	assert.deepEqual(stackByFromArray(['foo', 42]), []);
});

test('known criteria kept, unknown dropped, duplicates removed, canonical order', () => {
	assert.deepEqual(stackByFromArray(['language', 'foo', 'print', 'print']), ['print', 'language']);
});

test("['copy'] → 'copy'; copy mixed with criteria → by name (invalid)", () => {
	assert.equal(stackByFromArray(['copy']), 'copy');
	assert.deepEqual(stackByFromArray(['copy', 'print']), []);
});

test('round trip', () => {
	assert.deepEqual(stackByToArray('copy'), ['copy']);
	assert.deepEqual(stackByToArray(['finish', 'print']), ['print', 'finish']);
	assert.deepEqual(stackByFromArray(stackByToArray(['flags', 'condition'])), [
		'condition',
		'flags',
	]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/lib/card/utils/stack-by.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stack-by.ts`**

```ts
import type { StackBy, StackCriterion } from '@/types/cards';
import { STACK_CRITERIA } from '@/lib/card/utils/group-cards';

/**
 * Parses a stored stacking value (DB text[] or localStorage JSON) into a StackBy.
 * Anything invalid — non-array, unknown values only, 'copy' mixed with criteria —
 * falls back to [] (by name) rather than throwing.
 */
export function stackByFromArray(value: unknown): StackBy {
	if (!Array.isArray(value)) return [];
	if (value.includes('copy')) return value.length === 1 ? 'copy' : [];
	return STACK_CRITERIA.filter((c) => value.includes(c));
}

/** Serialises a StackBy to the stored text[] form, criteria in canonical order. */
export function stackByToArray(value: StackBy): string[] {
	if (value === 'copy') return ['copy'];
	return STACK_CRITERIA.filter((c: StackCriterion) => value.includes(c));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/card/utils/stack-by.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Write the migration**

`supabase/migrations/20261004120000_add_profile_stack_by.sql`:

```sql
-- Per-list card stacking preference (collection / wishlist / deck owner view).
-- '{}' = stack by card name (historical behaviour); criteria add copy
-- properties that split stacks; '{copy}' alone = no stacking.
alter table public.profiles
  add column if not exists collection_stack_by text[] not null default '{}'::text[],
  add column if not exists wishlist_stack_by   text[] not null default '{}'::text[],
  add column if not exists deck_stack_by       text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_collection_stack_by_check;
alter table public.profiles
  add constraint profiles_collection_stack_by_check check (
    collection_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(collection_stack_by)) or collection_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_wishlist_stack_by_check;
alter table public.profiles
  add constraint profiles_wishlist_stack_by_check check (
    wishlist_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(wishlist_stack_by)) or wishlist_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_deck_stack_by_check;
alter table public.profiles
  add constraint profiles_deck_stack_by_check check (
    deck_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(deck_stack_by)) or deck_stack_by = array['copy']::text[])
  );
```

- [ ] **Step 6: Add the assertions to `verify_schema.sql`**

- Column list (after `('profiles','is_public','boolean'),('profiles','ignored_tags','ARRAY'),`):
  ```sql
      -- 20261004120000_add_profile_stack_by
      ('profiles','collection_stack_by','ARRAY'),('profiles','wishlist_stack_by','ARRAY'),
      ('profiles','deck_stack_by','ARRAY'),
  ```
- Defaults (after the `ignored_tags` row; add a comma to the previous row):
  ```sql
      ('profiles','ignored_tags','''{nsfw}''::text[]'),
      -- 20261004120000_add_profile_stack_by : '{}' = par nom.
      ('profiles','collection_stack_by','''{}''::text[]'),
      ('profiles','wishlist_stack_by','''{}''::text[]'),
      ('profiles','deck_stack_by','''{}''::text[]')
  ```
- CHECK list (after `('profiles','profiles_description_len')`, adding a comma to it):

  ```sql
      ('profiles','profiles_description_len'),
      -- 20261004120000_add_profile_stack_by
      ('profiles','profiles_collection_stack_by_check'),
      ('profiles','profiles_wishlist_stack_by_check'),
      ('profiles','profiles_deck_stack_by_check')
  ```

- [ ] **Step 7: Apply + verify + CHECK behaviour**

Run: `npm run sb:migrate` then `npm run sb:verify`
Expected: migrate applies `20261004120000`; verify reports no FAIL (the 3 new column, 3 default, 3 check assertions PASS). If a default assertion fails only on formatting, copy the exact `col_default` string the FAIL message prints into the expected value.

Then in Supabase Studio SQL editor (`npm run sb:studio`) or `psql`, run inside a transaction and roll back:

```sql
begin;
update public.profiles set collection_stack_by = '{print,finish}' where id = (select id from public.profiles limit 1); -- OK
update public.profiles set collection_stack_by = '{copy}' where id = (select id from public.profiles limit 1);         -- OK
update public.profiles set collection_stack_by = '{copy,print}' where id = (select id from public.profiles limit 1);   -- ERROR check
rollback;
begin;
update public.profiles set collection_stack_by = '{foo}' where id = (select id from public.profiles limit 1);          -- ERROR check
rollback;
```

- [ ] **Step 8: Profile types + mapping**

`src/lib/profile/types.ts`: add `import type { StackBy } from '@/types/cards';`, add to `Profile` after `ignoredTags: string[];`:

```ts
collectionStackBy: StackBy;
wishlistStackBy: StackBy;
deckStackBy: StackBy;
```

and add `| 'collectionStackBy' | 'wishlistStackBy' | 'deckStackBy'` to the `ProfileUpdate` Pick list.

`src/lib/profile/db/profiles.ts`:

- import `{ stackByFromArray, stackByToArray } from '@/lib/card/utils/stack-by'`;
- `ProfileRow`: add `collection_stack_by?: string[]; wishlist_stack_by?: string[]; deck_stack_by?: string[];` (optional: the public select does not fetch them);
- `rowToProfile`: add
  ```ts
    	collectionStackBy: stackByFromArray(row.collection_stack_by),
    	wishlistStackBy: stackByFromArray(row.wishlist_stack_by),
    	deckStackBy: stackByFromArray(row.deck_stack_by),
  ```
- `fetchProfile` select string (line 41 only — NOT `fetchProfileByNickname`): append `, collection_stack_by, wishlist_stack_by, deck_stack_by` before `, created_at`;
- `upsertProfile`: add
  ```ts
  if (updates.collectionStackBy !== undefined)
  	cols.collection_stack_by = stackByToArray(updates.collectionStackBy);
  if (updates.wishlistStackBy !== undefined)
  	cols.wishlist_stack_by = stackByToArray(updates.wishlistStackBy);
  if (updates.deckStackBy !== undefined) cols.deck_stack_by = stackByToArray(updates.deckStackBy);
  ```

`src/lib/profile/store/profile-store.ts` fallback profile: add `collectionStackBy: [], wishlistStackBy: [], deckStackBy: [],` after `ignoredTags: ['nsfw'],`.

Run `npx tsc --noEmit -p . 2>&1 | grep -i profile` — fix any other place that builds a full `Profile` literal (add the three `[]` fields).

- [ ] **Step 9: Static gate + commit**

```bash
npx eslint src/lib/card/utils/stack-by.ts src/lib/card/utils/stack-by.test.ts src/lib/profile
git add supabase/migrations/20261004120000_add_profile_stack_by.sql supabase/verify_schema.sql src/lib/card/utils/stack-by.ts src/lib/card/utils/stack-by.test.ts src/lib/profile
git commit -m "feat(stacking): per-list stack_by profile columns + row mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `useStackBy` hook

**Files:**

- Create: `src/lib/card/hooks/useStackBy.ts`

**Interfaces:**

- Consumes: `stackByFromArray`, `stackByToArray` (Task 2); `useAuth()` from `@/lib/supabase/contexts/AuthContext` (`{ user, isLoading }`); `useProfileContext()` from `@/lib/profile/context/ProfileContext` (`{ profile, updateProfile }`).
- Produces: `type StackList = 'collection' | 'wishlist' | 'deck'`; `useStackBy(list: StackList): [StackBy, (next: StackBy) => void]`.

- [ ] **Step 1: Implement**

```ts
'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { StackBy } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { stackByFromArray, stackByToArray } from '@/lib/card/utils/stack-by';

export type StackList = 'collection' | 'wishlist' | 'deck';

const PROFILE_FIELD = {
	collection: 'collectionStackBy',
	wishlist: 'wishlistStackBy',
	deck: 'deckStackBy',
} as const;

const storageKey = (list: StackList) => `wizcard-stack-by-${list}`;

// Same-tab writes don't fire `storage`; notify subscribers by hand.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
	listeners.add(onChange);
	window.addEventListener('storage', onChange);
	return () => {
		listeners.delete(onChange);
		window.removeEventListener('storage', onChange);
	};
}

function readRaw(list: StackList): string | null {
	try {
		return window.localStorage.getItem(storageKey(list));
	} catch {
		return null;
	}
}

function parseRaw(raw: string | null): StackBy {
	if (!raw) return [];
	try {
		return stackByFromArray(JSON.parse(raw));
	} catch {
		return [];
	}
}

/**
 * The stacking setting of one card list. Signed in: the profile column
 * (optimistic write + sync queue via updateProfile). Signed out: localStorage.
 * By name ([]) while the profile loads; no merge on sign-in — the profile wins.
 */
export function useStackBy(list: StackList): [StackBy, (next: StackBy) => void] {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const raw = useSyncExternalStore(
		subscribe,
		() => readRaw(list),
		() => null
	);
	const localValue = useMemo(() => parseRaw(raw), [raw]);

	// Memoised so a loading profile doesn't hand consumers a fresh [] every render.
	const profileValue = user ? profile?.[PROFILE_FIELD[list]] : undefined;
	const value = useMemo<StackBy>(
		() => (user ? (profileValue ?? []) : localValue),
		[user, profileValue, localValue]
	);

	const setValue = useCallback(
		(next: StackBy) => {
			if (user) {
				updateProfile({ [PROFILE_FIELD[list]]: next });
				return;
			}
			try {
				window.localStorage.setItem(storageKey(list), JSON.stringify(stackByToArray(next)));
			} catch {
				// Storage unavailable (private mode): the setting just won't persist.
			}
			for (const l of listeners) l();
		},
		[user, list, updateProfile]
	);

	return [value, setValue];
}
```

- [ ] **Step 2: Static gate + commit**

Run: `npx eslint src/lib/card/hooks/useStackBy.ts` and `npx tsc --noEmit -p . 2>&1 | grep useStackBy` — no output.
Behaviour is verified in the browser in Task 5 (no React test harness in the repo).

```bash
git add src/lib/card/hooks/useStackBy.ts
git commit -m "feat(stacking): useStackBy hook (profile when signed in, localStorage otherwise)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `StackByMenu` + `CardList.toolbarExtra` + i18n

**Files:**

- Create: `src/lib/card/components/StackByMenu/StackByMenu.tsx`
- Create: `src/lib/card/components/StackByMenu/StackByMenu.module.css`
- Modify: `src/lib/card/components/CardList/CardList.types.ts` (prop)
- Modify: `src/lib/card/components/CardList/CardList.tsx` (render slot)
- Modify: `src/lib/card/components/CardList/CardList.module.css` (toolbar row)
- Modify: `messages/fr.json`, `messages/en.json` (new top-level `stacking` namespace)

**Interfaces:**

- Consumes: `StackBy`, `StackCriterion` (Task 1), `STACK_CRITERIA` (Task 1).
- Produces: `<StackByMenu value={StackBy} onChange={(v: StackBy) => void} />`; `CardListProps.toolbarExtra?: ReactNode`.

- [ ] **Step 1: i18n strings**

Add a top-level `"stacking"` object to `messages/fr.json`:

```json
	"stacking": {
		"button": "Empiler : {summary}",
		"unstacked": "Non empilé",
		"nameAndMore": "Nom + {count} critères",
		"noStack": "Ne pas empiler",
		"stackBy": "Empiler par :",
		"name": "Nom",
		"nameAlways": "Nom (toujours)",
		"print": "Édition",
		"finish": "Finition",
		"condition": "État",
		"language": "Langue",
		"flags": "Proxy / altérée / échange"
	}
```

and to `messages/en.json`:

```json
	"stacking": {
		"button": "Stack: {summary}",
		"unstacked": "Not stacked",
		"nameAndMore": "Name + {count} criteria",
		"noStack": "Don't stack",
		"stackBy": "Stack by:",
		"name": "Name",
		"nameAlways": "Name (always)",
		"print": "Printing",
		"finish": "Finish",
		"condition": "Condition",
		"language": "Language",
		"flags": "Proxy / altered / for trade"
	}
```

Validate: `node -e "for (const f of ['fr','en']) JSON.parse(require('fs').readFileSync('messages/'+f+'.json'))"` — no output.

- [ ] **Step 2: `CardList.toolbarExtra`**

In `CardList.types.ts`, add to `CardListProps` (after `viewModes?`):

```ts
	/** Extra controls rendered on the toolbar row, right of the view-mode toggle. */
	toolbarExtra?: ReactNode;
```

In `CardList.tsx`: destructure `toolbarExtra,` and replace the `const toggle = viewModes.length > 1 && (...)` block with:

```tsx
const viewToggle = viewModes.length > 1 && (
	<div className={styles.viewToggle}>
		{viewModes.map((mode) => (
			<button
				key={mode}
				type="button"
				className={`${styles.toggleBtn} ${viewMode === mode ? styles.toggleBtnActive : ''}`}
				onClick={() => setViewMode(mode)}
			>
				{VIEW_MODE_LABELS[mode]}
			</button>
		))}
	</div>
);
const toggle =
	toolbarExtra != null ? (
		<div className={styles.toolbar}>
			{viewToggle}
			{toolbarExtra}
		</div>
	) : (
		viewToggle
	);
```

(Every existing `{toggle}` usage stays; consumers without `toolbarExtra` render exactly as before.)

In `CardList.module.css` add:

```css
.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: 8px;
}
```

- [ ] **Step 3: `StackByMenu` component**

`StackByMenu.tsx`:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StackBy, StackCriterion } from '@/types/cards';
import { STACK_CRITERIA } from '@/lib/card/utils/group-cards';
import styles from './StackByMenu.module.css';

type Props = {
	value: StackBy;
	onChange: (next: StackBy) => void;
};

/**
 * "Stack by" popover: no stacking, or the card name plus any copy properties.
 * Applies on every click. Remembers the last criteria so switching back from
 * "don't stack" restores them.
 */
export function StackByMenu({ value, onChange }: Props) {
	const t = useTranslations('stacking');
	const [open, setOpen] = useState(false);
	const [lastCriteria, setLastCriteria] = useState<StackCriterion[]>(value === 'copy' ? [] : value);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();

	const unstacked = value === 'copy';
	const criteria = unstacked ? lastCriteria : value;

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: MouseEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setOpen(false);
				buttonRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	let summary: string;
	if (unstacked) summary = t('unstacked');
	else if (value.length > 2)
		summary = t('button', { summary: t('nameAndMore', { count: value.length }) });
	else summary = t('button', { summary: [t('name'), ...value.map((c) => t(c))].join(' + ') });

	function setUnstacked(on: boolean) {
		if (on) {
			if (value !== 'copy') setLastCriteria(value);
			onChange('copy');
		} else {
			onChange(lastCriteria);
		}
	}

	function toggleCriterion(c: StackCriterion) {
		const next = criteria.includes(c) ? criteria.filter((x) => x !== c) : [...criteria, c];
		const ordered = STACK_CRITERIA.filter((x) => next.includes(x));
		setLastCriteria(ordered);
		onChange(ordered);
	}

	return (
		<div className={styles.root} ref={rootRef}>
			<button
				ref={buttonRef}
				type="button"
				className={styles.trigger}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((o) => !o)}
			>
				{summary}
				<span aria-hidden="true" className={styles.caret}>
					▾
				</span>
			</button>
			{open && (
				<div id={panelId} className={styles.panel}>
					<label className={styles.row}>
						<input
							type="radio"
							name={`${panelId}-mode`}
							checked={unstacked}
							onChange={() => setUnstacked(true)}
						/>
						{t('noStack')}
					</label>
					<label className={styles.row}>
						<input
							type="radio"
							name={`${panelId}-mode`}
							checked={!unstacked}
							onChange={() => setUnstacked(false)}
						/>
						{t('stackBy')}
					</label>
					<div className={styles.criteria}>
						<label className={`${styles.row} ${styles.disabled}`}>
							<input type="checkbox" checked disabled />
							{t('nameAlways')}
						</label>
						{STACK_CRITERIA.map((c) => (
							<label key={c} className={`${styles.row} ${unstacked ? styles.disabled : ''}`}>
								<input
									type="checkbox"
									checked={criteria.includes(c)}
									disabled={unstacked}
									onChange={() => toggleCriterion(c)}
								/>
								{t(c)}
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
```

`StackByMenu.module.css`:

```css
.root {
	position: relative;
	margin-bottom: 12px;
}

.trigger {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	background: none;
	border: 1px solid var(--border);
	border-radius: 8px;
	color: var(--text-muted);
	font-size: var(--text-sm);
	font-weight: 600;
	cursor: pointer;
	white-space: nowrap;
}

.trigger:hover,
.trigger[aria-expanded='true'] {
	color: var(--foreground);
}

.caret {
	font-size: 0.75em;
}

.panel {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	z-index: 50;
	min-width: 220px;
	padding: 8px;
	background: var(--glass-bg, rgba(20, 20, 30, 0.92));
	border: 1px solid var(--border);
	border-radius: 8px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.criteria {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-left: 20px;
}

.row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 6px;
	border-radius: 4px;
	font-size: var(--text-sm);
	color: var(--foreground);
	cursor: pointer;
}

.row:hover {
	background: rgba(255, 255, 255, 0.06);
}

.disabled {
	opacity: 0.5;
	cursor: default;
}
```

- [ ] **Step 4: Static gate + commit**

Run: `npx eslint src/lib/card/components/StackByMenu src/lib/card/components/CardList` and `npx tsc --noEmit -p .` — no new problems. (Visual check happens in Task 5, where the menu is first mounted.)

```bash
git add src/lib/card/components/StackByMenu src/lib/card/components/CardList messages/fr.json messages/en.json
git commit -m "feat(stacking): StackByMenu popover + CardList toolbarExtra slot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire collection + wishlist (and fix rowId lookups)

**Files:**

- Modify: `src/lib/collection-index/hooks/useIndexedCollection.ts`
- Modify: `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx` (`toolbarExtra` prop, `stackByCardId` → rowId, all `.get(card.id)` lookups, qty column)
- Modify: `src/app/[locale]/collection/page.tsx`
- Modify: `src/app/[locale]/wishlist/page.tsx` (lookup map + `.get(card.id)` sites at ~lines 77-82, 154-180; `CardList` at ~line 145)

**Interfaces:**

- Consumes: `groupByStack` (Task 1), `useStackBy` (Task 3), `StackByMenu` + `toolbarExtra` (Task 4), `cardKey` from `@/lib/card/utils/card-key`.
- Produces: `useIndexedCollection(entries, opts: { filterable: boolean; stackBy?: StackBy })`; `CollectionView` prop `toolbarExtra?: ReactNode`.

- [ ] **Step 1: `useIndexedCollection`**

- import `type StackBy` from `@/types/cards` (add to the existing type import);
- signature: `opts: { filterable: boolean; stackBy?: StackBy }`, and at the top of the body `const stackBy = opts.stackBy ?? EMPTY_STACK_BY;` with a module constant `const EMPTY_STACK_BY: StackBy = [];` (stable reference for memo deps);
- line 44: `const grouped = groupByStack(copies, stackBy);` and add `stackBy` to that `useMemo` deps array;
- reset key:

  ```ts
  const stackKey = JSON.stringify(stackBy);
  const resetKey = opts.filterable
  	? `${JSON.stringify(filters)}|${stackKey}`
  	: `static|${stackKey}`;
  ```

- [ ] **Step 2: `CollectionView` — rowId lookups + toolbar slot**

- import `{ cardKey } from '@/lib/card/utils/card-key'`;
- Props: add
  ```ts
    /** Controls rendered on the card list toolbar row (e.g. the stacking menu). */
    toolbarExtra?: ReactNode;
  ```
  and destructure it;
- replace the `stackByCardId` memo with:
  ```ts
  // Look stacks up by their representative's rowId: several stacks can share
  // one print id once stacking is finer than by-name (e.g. foil vs non-foil).
  const stackByRowId = useMemo(() => {
  	const map = new Map<string, CardStack>();
  	for (const stack of visibleStacks) {
  		const rep = stack.cards[0];
  		if (rep) map.set(rep.entry.rowId, stack);
  	}
  	return map;
  }, [visibleStacks]);
  ```
- replace every `stackByCardId.get(card.id)` (onCardClick, buildCardMenuItems, renderOverlay, qty column `render`) with `stackByRowId.get(cardKey(card))`;
- pass `toolbarExtra={toolbarExtra}` to `<CardList>`.

Verify: `grep -n "stackByCardId\|get(card.id)" "src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx"` → no output.

- [ ] **Step 3: Collection page**

In `src/app/[locale]/collection/page.tsx`:

```tsx
import { useStackBy } from '@/lib/card/hooks/useStackBy';
import { StackByMenu } from '@/lib/card/components/StackByMenu/StackByMenu';
```

```tsx
const [stackBy, setStackBy] = useStackBy('collection');
const model = useIndexedCollection(entries, { filterable: true, stackBy });
```

and on `<CollectionView ...>` add `toolbarExtra={<StackByMenu value={stackBy} onChange={setStackBy} />}`.

- [ ] **Step 4: Wishlist page**

In `src/app/[locale]/wishlist/page.tsx`:

- same two imports + `import { cardKey } from '@/lib/card/utils/card-key';`;
- `const [stackBy, setStackBy] = useStackBy('wishlist');` and `useIndexedCollection(entries, { filterable: false, stackBy })`;
- rename the `stackByCardId` memo to `stackByRowId`, keyed `map.set(rep.entry.rowId, stack)`, with the same comment as Step 2;
- replace every `stackByCardId.get(card.id)` with `stackByRowId.get(cardKey(card))`;
- add `toolbarExtra={<StackByMenu value={stackBy} onChange={setStackBy} />}` to its `<CardList>`.

Verify: `grep -n "stackByCardId\|get(card.id)" "src/app/[locale]/wishlist/page.tsx"` → no output.

- [ ] **Step 5: Static gate**

Run: `npx eslint src/lib/collection-index "src/app/[locale]/collection" "src/app/[locale]/wishlist"` and `npx tsc --noEmit -p .` — no new problems.

- [ ] **Step 6: Browser verification** (`npm run dev`, signed in with a non-EN profile and a collection that has the same printing in foil and non-foil)

Check each and note the result:

1. `/collection` default shows the button "Empiler : Nom" and the grid is identical to before (same tiles, same `xN`).
2. Tick Édition → tiles split per printing; tick Finition → foil/non-foil split. Click each of two same-print stacks (foil vs non-foil): each opens its own copies; right-click menu acts on its own stack; table view qty matches.
3. "Ne pas empiler" → no `xN` badges; tile count = copy count; switch back → previous criteria restored.
4. With a colour or "foil" filter active plus Finition stacking, no stack disappears (compare count with by-name filtered result).
5. Sort by quantity works in each mode.
6. Reload → setting kept. Studio: the profile row's `collection_stack_by` holds the value.
7. `/wishlist` has its own independent setting.
8. Sign out (or private window): menu works, setting survives reload via localStorage `wizcard-stack-by-collection`.
9. Escape closes the menu and focus returns to the button; click outside closes it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/collection-index "src/app/[locale]/collection" "src/app/[locale]/wishlist"
git commit -m "feat(stacking): stacking menu on collection + wishlist; rowId stack lookups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 2 — deck owner view

### Task 6: Deck sections stacked per zone

**Files:**

- Modify: `src/app/[locale]/decks/[id]/useDeckCardSections.ts`
- Modify: `src/lib/card/utils/group-by-card-type.ts` (optional `keyOf`)
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx` (call site ~line 143, qty column ~line 223-232)

**Interfaces:**

- Consumes: `groupByStack`, `stackKeyOf` (Task 1), `cardKey`.
- Produces: `useDeckCardSections(cardsByZone, showCommander, sortCards?, groupBy?, stackBy?: StackBy)` returns `{ sections, groupByCardId, stackByRowId }` where

  ```ts
  export type DeckStack = { selectionKey: string; zone: DeckZone; copies: ResolvedDeckCard[] };
  // stackByRowId: Map<rowId, DeckStack> — EVERY copy's rowId (all zones incl. tokens) maps to its stack.
  ```

  `selectionKey` = `` `${zone}:${stackKeyOf(rep, stackBy)}` `` (tokens use by-name stacking).

- [ ] **Step 1: `groupByCardType` key function**

In `group-by-card-type.ts`, change the signature and count line:

```ts
export function groupByCardType(
	cards: AnyCard[],
	countById?: Map<string, number>,
	keyOf: (card: AnyCard) => string = (card) => card.id
): CardListSection[] {
```

```ts
			? group.reduce((sum, c) => sum + (countById.get(keyOf(c)) ?? 1), 0)
```

(`ImportPreview` keeps the default `card.id` key — unchanged.)

- [ ] **Step 2: Stack inside each zone**

In `useDeckCardSections.ts`:

- imports: `import type { StackBy } from '@/types/cards';`, `import { groupByStack, stackKeyOf } from '@/lib/card/utils/group-cards';`, `import { cardKey } from '@/lib/card/utils/card-key';`
- export the type:
  ```ts
  /** One displayed deck tile: a stack of copies inside a single zone. */
  export type DeckStack = { selectionKey: string; zone: DeckZone; copies: ResolvedDeckCard[] };
  const EMPTY_STACK_BY: StackBy = [];
  ```
- signature: add a 5th param `stackBy: StackBy = EMPTY_STACK_BY` and add `stackBy` to the `useMemo` deps.
- after the `groupByCardId` loop, build the per-zone stacks for every group zone (tokens by name):
  ```ts
  // Per-zone stacks. Every copy's rowId maps to its stack so any copy used as a
  // tile (section representative, token dedupe pick) resolves its stack.
  const stackByRowId = new Map<string, DeckStack>();
  const zoneStacks = new Map<DeckZone, ResolvedDeckCard[][]>();
  for (const zone of groupZones) {
  	const zoneBy = zone === 'tokens' ? EMPTY_STACK_BY : stackBy;
  	const stacks = groupByStack(cardsByZone[zone] ?? [], zoneBy);
  	zoneStacks.set(
  		zone,
  		stacks.map((s) => s.cards)
  	);
  	for (const s of stacks) {
  		const stack: DeckStack = { selectionKey: `${zone}:${s.key}`, zone, copies: s.cards };
  		for (const c of s.cards) stackByRowId.set(c.entry.rowId, stack);
  	}
  }
  ```
  (`ResolvedDeckCard` = `CardCopy`, which is assignable to `FacetCopy` — verified — so no cast or bound change is needed.)
- replace the per-zone dedupe block (the `seen` / `sectionCards` / `countById` loop) with:
  ```ts
  // One tile per stack; counts keyed by the representative's rowId so two
  // stacks sharing a print id never collide.
  const sectionCards: ResolvedDeckCard[] = [];
  const countById = new Map<string, number>();
  for (const copies of zoneStacks.get(zone) ?? []) {
  	const rep = copies[0];
  	sectionCards.push(rep);
  	countById.set(rep.entry.rowId, copies.length);
  }
  ```
- children: `groupByCardType(sortedCards, countById, cardKey)`.
- return `{ sections, groupByCardId, stackByRowId }`.

Note: the previous code kept "the first copy of this zone" as representative; `groupByStack` uses `preferPrint` instead. In by-name mode the tile image may now show the preferred print rather than the first-added copy for multi-print cards in one zone. This is accepted (same rule as the collection); the zone is still correct because the rep is taken from the zone's own copies.

- [ ] **Step 3: Owner view call site + qty column**

In `DeckDetailOwnerView.tsx`:

- `const { sections, groupByCardId, stackByRowId } = useDeckCardSections(cardsByZone, showCommander, sortCards, groupBy, deckStackBy);` — temporarily declare `const deckStackBy: StackBy = [];` just above (replaced by `useStackBy('deck')` in Task 8), importing `type StackBy`.
- qty column `render`:
  ```ts
    			render: (card) => {
    				const c = card as ResolvedDeckCard;
    				return stackByRowId.get(c.entry.rowId)?.copies.length ?? 1;
    			},
  ```
  and replace `groupByCardId` by `stackByRowId` in that memo's deps.
- Do not touch `useDeckCardModalProps.tsx` (its own `useDeckCardSections` call uses the defaults and only reads `groupByCardId`).

- [ ] **Step 4: Static gate + by-name regression check**

Run: `npx eslint "src/app/[locale]/decks/[id]" src/lib/card/utils` and `npx tsc --noEmit -p .` — no new problems; `npx tsx --test src/lib/card/utils/*.test.ts` still PASS.
Browser: open an owned deck — sections, per-type sub-section counts, table qty and `xN` badges are identical to before.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/decks/[id]" src/lib/card/utils
git commit -m "feat(stacking): deck sections stack per zone; rowId-keyed counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Overlay + collection badge act on the displayed stack

**Files:**

- Modify: `src/app/[locale]/decks/[id]/components/DeckCardOverlay/DeckCardOverlay.tsx`
- Modify: `src/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge.ts`
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx` (`renderOverlay`, ~line 470-520)

**Interfaces:**

- Consumes: `stackByRowId: Map<string, DeckStack>` (Task 6).
- Produces: `DeckCardOverlay` prop `stackCopies: CardCopy[]`; `useCollectionBadge(group, stackCopies, currentDeckId, oracleScryfallIds, deckNameResolver, wishlistEntries?, isPending?)` (the `currentZone` parameter is replaced by `stackCopies`).

- [ ] **Step 1: `useCollectionBadge`**

Replace the `currentZone: DeckZone` parameter with `stackCopies: CardCopy[]` (import `CardCopy` from `@/types/cards`; drop `DeckZone` from the import if unused), and inside the memo replace

```ts
const zoneCopies = group.byZone.get(currentZone) ?? [];
```

with

```ts
// Ownership of the displayed stack (one zone, finer per the stacking setting).
const zoneCopies = stackCopies;
```

Replace `currentZone` by `stackCopies` in the memo deps array.

- [ ] **Step 2: `DeckCardOverlay`**

- Props: add
  ```ts
    /** Copies of the displayed stack (this zone, this stack) — every action targets these. */
    stackCopies: CardCopy[];
  ```
  and destructure it.
- Replace `const zoneCopies = group.byZone.get(currentZone) ?? [];` with `const zoneCopies = stackCopies;`
- In the `useCollectionBadge(...)` call, replace the `currentZone` argument with `stackCopies`.
- Keep `currentZone` (still used for `otherZones`).

- [ ] **Step 3: `renderOverlay` passes the stack**

In `DeckDetailOwnerView.tsx` `renderOverlay`, after `if (!group) return null;` compute

```ts
const stackCopies = stackByRowId.get(c.entry.rowId)?.copies ?? group.byZone.get(currentZone) ?? [];
```

pass `stackCopies={stackCopies}` to `<DeckCardOverlay>`, change `const firstCopy = group.byZone.get(currentZone)?.[0];` to `const firstCopy = stackCopies[0];`, and add `stackByRowId` to the `useCallback` deps.

- [ ] **Step 4: Static gate + browser check**

Run: `npx eslint "src/app/[locale]/decks/[id]"` and `npx tsc --noEmit -p .` — no new problems.
Browser (temporarily set `const deckStackBy: StackBy = ['finish'];` in the owner view, revert before commit): on a deck with the same card foil + non-foil in mainboard → two tiles; `+1` on the foil tile adds a foil copy to the foil tile; `−1` removes from that tile only; "move to sideboard" moves one copy of that tile; ownership badge counts reflect that tile's copies. Tokens panel overlay still shows its count and menu.

- [ ] **Step 5: Commit** (with `deckStackBy` back to `[]`)

```bash
git add "src/app/[locale]/decks/[id]"
git commit -m "feat(stacking): deck overlay and ownership badge act on the displayed stack

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Deck bulk selection keyed by stack + deck stacking menu

**Files:**

- Modify: `src/app/[locale]/decks/[id]/useDeckBulkSelection.ts`
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- Consumes: `stackByRowId: Map<string, DeckStack>`, `DeckStack` (Task 6); `useStackBy` (Task 3); `StackByMenu` (Task 4).
- Produces: `useDeckBulkSelection().selectedRowIds(stackByKey: Map<string, DeckStack>, predicate?)` — selection keys are `DeckStack.selectionKey`.

- [ ] **Step 1: `selectedRowIds` resolves stacks**

In `useDeckBulkSelection.ts`: replace the `DeckCardGroup` import with `import type { DeckStack } from './useDeckCardSections';`, update the header doc comment ("Selection is keyed by the displayed stack (`DeckStack.selectionKey` = zone + stack key): one selected tile = that stack's copies in that zone."), and replace `selectedRowIds`:

```ts
const selectedRowIds = useCallback(
	(
		stackByKey: Map<string, DeckStack>,
		predicate?: (card: ResolvedDeckCard) => boolean
	): string[] => {
		const rowIds: string[] = [];
		for (const key of selected) {
			const stack = stackByKey.get(key);
			if (!stack) continue;
			for (const card of stack.copies) {
				if (predicate && !predicate(card)) continue;
				rowIds.push(card.entry.rowId);
			}
		}
		return rowIds;
	},
	[selected]
);
```

- [ ] **Step 2: Owner view — keys, menu, clear on change**

In `DeckDetailOwnerView.tsx`:

- replace the temporary `const deckStackBy: StackBy = [];` with
  ```ts
  const [deckStackBy, setDeckStackBy] = useStackBy('deck');
  ```
  (imports: `useStackBy`, `StackByMenu`).
- after `useDeckCardSections(...)`, build the key map and the list of displayed keys:
  ```ts
  // Selection works on displayed stacks: selectionKey → stack (unique stacks).
  const stackBySelectionKey = useMemo(() => {
  	const map = new Map<string, DeckStack>();
  	for (const stack of stackByRowId.values()) map.set(stack.selectionKey, stack);
  	return map;
  }, [stackByRowId]);
  const selectionKeyOf = useCallback(
  	(card: AnyCard) => stackByRowId.get((card as ResolvedDeckCard).entry.rowId)?.selectionKey,
  	[stackByRowId]
  );
  ```
  (import `type DeckStack` from `./useDeckCardSections`).
- `handleCardClick`, select branch:
  ```ts
  if (bulk.selectMode) {
  	const key = selectionKeyOf(card);
  	if (key) bulk.toggle(key);
  	return;
  }
  ```
  add `selectionKeyOf` to its deps.
- `allOracleKeys` → rename to `allStackKeys` (tokens included, as today — they are selectable in select mode):
  ```ts
  const allStackKeys = useMemo(() => [...stackBySelectionKey.keys()], [stackBySelectionKey]);
  ```
  and update `allSelected` and `onToggleSelectAll={() => bulk.toggleSelectAll(allStackKeys)}`.
- `sectionsWithSelectAll`: replace both `keys.add((card as ResolvedDeckCard).oracle_id ?? card.id)` with
  ```ts
  const key = selectionKeyOf(card);
  if (key) keys.add(key);
  ```
  (for `section.cards` and `child.cards`), update its comment ("keyed by stack selection key"), add `selectionKeyOf` to deps.
- every `bulk.selectedRowIds(groupByCardId ...)` (wishlist, add-to-collection, edit apply, remove request, remove confirm — 5 sites) → `bulk.selectedRowIds(stackBySelectionKey ...)`, and replace `groupByCardId` with `stackBySelectionKey` in those callbacks' deps.
- `renderOverlay` select branch: `const checked = bulk.selected.has(selectionKeyOf(card) ?? '');` and add `selectionKeyOf` to deps.
- clear the selection when stacking changes:
  ```ts
  const handleDeckStackByChange = useCallback(
  	(next: StackBy) => {
  		setDeckStackBy(next);
  		bulk.clear();
  	},
  	[setDeckStackBy, bulk]
  );
  ```
- main `<CardList>`: add `toolbarExtra={<StackByMenu value={deckStackBy} onChange={handleDeckStackByChange} />}`.

Verify: `grep -n "oracle_id ?? c.id)\|oracle_id ?? card.id)\|selectedRowIds(groupByCardId" "src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx"` — the only remaining `oracle_id ?? c.id` hits are `groupByCardId.get(...)` lookups (modal open + overlay group), not selection keys.

- [ ] **Step 3: Static gate**

Run: `npx eslint "src/app/[locale]/decks/[id]"` and `npx tsc --noEmit -p .` — no new problems.

- [ ] **Step 4: Browser verification** (owned deck with the same card foil + non-foil in mainboard, a copy in sideboard, and a token)

1. Default "Empiler : Nom": select mode → tick a mainboard card → bulk edit "condition LP" applies to its mainboard copies only (sideboard copy unchanged — intended change from before).
2. "Nom + Finition": tick the foil tile only → bulk "remove" removes only foil copies.
3. Section "select all" and global "select all / deselect all" toggle all visible stacks; counter = number of stacks.
4. With a selection active, change stacking → selection cleared, counter 0.
5. Token tile selectable; bulk wishlist on it works.
6. Click outside select mode still opens the card modal with all copies of the card (all zones).
7. Setting survives reload (profile `deck_stack_by`); collection/wishlist settings unaffected.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/decks/[id]"
git commit -m "feat(stacking): deck stacking menu; bulk selection keyed by displayed stack

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Whole-branch verification

**Files:** none (fixes only if a check fails, committed as `fix(stacking): …`)

- [ ] **Step 1: Unit tests** — `npx tsx --test src/lib/card/utils/*.test.ts` → all PASS.
- [ ] **Step 2: Lint/types on everything changed** — `git diff --name-only $BASE..HEAD -- '*.ts' '*.tsx' | xargs npx eslint` and `npx tsc --noEmit -p .` → no problem in changed files.
- [ ] **Step 3: Production build** — `npm run build` → succeeds (catches TS2589 and server-only import leaks that per-file checks miss).
- [ ] **Step 4: Schema audit** — `npm run sb:verify` → no FAIL.
- [ ] **Step 5: Regression pass in the browser** — `/collection`, `/wishlist`, owned deck, public deck (`/decks/[id]` signed out — must be unchanged, no menu), public profile collection `/users/[userId]` (no menu, renders as before), import preview modal (stacks as before).
- [ ] **Step 6: Report** — list commits, test/build output, browser checks done, and the remaining manual step: **apply `20261004120000_add_profile_stack_by.sql` to prod** via the usual workflow (idempotent script in the SQL editor, then insert into `supabase_migrations.schema_migrations`), then `npm run sb:verify:prod`. Until then, signed-in prod users' writes to the new columns would fail in the sync queue — **do not deploy the app before the migration**.
