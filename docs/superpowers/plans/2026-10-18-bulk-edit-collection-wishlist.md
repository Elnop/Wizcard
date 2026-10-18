# Bulk selection and edit (collection, wishlist, shared with deck) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A selection mode on `/collection` and `/wishlist` (edit fields, remove, collection → deck, wishlist → collection), built on a bulk module shared with the deck, with one grouped `bulk-update` sync op instead of N `update` ops.

**Architecture:** Pure functions (`applyBulkEdit`, `entryDbPatch`, `groupRowUpdates`, `rowIdsOfSelected`, plan functions) carry the logic and are unit-tested with `node:test`. A shared module `src/lib/card/bulk/` holds the selection hook and the UI (`BulkActionBar`, `BulkEditModal`, `BulkSelectOverlay`, `SelectModeButton`). Cross-store bulk actions live in plain modules (`src/lib/collection/bulk-actions.ts`, `src/lib/wishlist/bulk-actions.ts`) bound by the contexts, so `collection-store` never imports `deck-store` (deck-store already imports collection-store).

**Tech Stack:** Next.js (App Router) + React 19, zustand stores, Supabase/PostgREST, next-intl, CSS modules, `node:test` through `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-18-bulk-edit-collection-wishlist-design.md`

## Global Constraints

- No DB migration. `bulk-update` matches on `id` only (`.in('id', chunk)`), chunks of **200** ids (PostgREST 414s at ~300).
- The same `rowId` is never in both the collection and the wishlist.
- The deck zone tag (`deck:<zone>`) is never removed by a tag removal.
- Collection/wishlist selection key = **`stack.key`** (unique per stack by construction in `groupByStack`; `stackKeyOf` returns `entry.rowId` in `'copy'` mode). The spec says "representative `rowId`"; `stack.key` is used instead because the paged `CardStack` can drop an unresolvable first copy and change its representative, while `key` is copied unchanged by `toCardStack`.
- Selection clears at **render time** when `resetKey` changes (no `useEffect`).
- After a collection/wishlist action: selection cleared, select mode stays on. The deck keeps its current behaviour (`bulk.exit()` after an action).
- Tests: `npx tsx --test <file>` for files under `src/lib/`. Files under `src/app/[locale]/…` run as `npx tsx "<path>"` (node --test treats `[locale]` as a glob).
- Gate: `npm run check` has ~60 pre-existing problems; gate on **no new problems**: `npx eslint <changed files>` + `npx tsc --noEmit -p .` + `npm run build` at the end (TS2589 and the server-only import boundary only show there).
- Browser checks on `http://localhost:<port>`, never `127.0.0.1` (not in `allowedDevOrigins` → no hydration).
- i18n: every new key exists in **both** `messages/en.json` and `messages/fr.json`, ICU plurals.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stacking by a field that the edit changes** (stacked by condition, edit condition → NM): stacks re-key; the selection must be cleared right after the action, never resolving stale keys to the wrong copies. Pinned in Task 4 (stale keys ignored) and Tasks 9/10 (clear after action).
2. **Copies that are deck cards** (collection copy with `deckId`, wishlisted deck card with `owner_id = NULL`): every bulk write must reach them (id-only match) and mirror the loaded deck store. Pinned in Task 3 (query by id only), Tasks 7/8 plan tests.
3. **Tags add + remove of the same tag / zone tag in the remove list**: add wins over remove for user tags; zone tag survives. Pinned in Task 1 tests.
4. **Foil toggled off on etched copies**: `foilType` must be cleared, otherwise the DB keeps `foil_type='etched'` with `is_foil=false`. Pinned in Task 1 + Task 2 tests.
5. **Escape while a modal is open over the action bar**: must close only the modal, not leave select mode. Pinned in Task 5 (`escapeDisabled` prop) and wired in Tasks 6/9/10.

---

## File structure

| File                                                                         | Responsibility                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib/card/bulk/bulk-edit.ts` (new)                                       | `BulkField`, `BulkEdit`, `BulkEditForm`, `buildBulkEdit`, `isEmptyBulkEdit`, `applyBulkEdit`, `mergeTags` |
| `src/lib/card/db/entry-db-patch.ts` (new)                                    | `DbPatch`, `entryDbPatch(before, after)`, `isEmptyDbPatch`                                                |
| `src/lib/supabase/group-row-updates.ts` (new)                                | `BulkUpdateRow`, `groupRowUpdates(rows, chunkSize)`                                                       |
| `src/lib/supabase/sync-queue.ts`                                             | new `bulk-update` op variant                                                                              |
| `src/lib/supabase/queries/cards.ts`                                          | `updateCardRowsByIds(ids, payload)`                                                                       |
| `src/lib/supabase/useSyncQueue.ts`                                           | execute `bulk-update`                                                                                     |
| `src/lib/card/bulk/selection.ts` (new)                                       | `rowIdsOfSelected` (pure)                                                                                 |
| `src/lib/card/bulk/useBulkSelection.ts` (new)                                | generic selection hook with `resetKey`                                                                    |
| `src/lib/card/bulk/useStackSelection.ts` (new)                               | facet-stack selection for collection/wishlist (keys, counts, selected copies)                             |
| `src/lib/card/bulk/BulkActionBar.tsx` + `.module.css` (moved from deck)      | floating bar                                                                                              |
| `src/lib/card/bulk/BulkEditModal.tsx` + `.module.css` (moved from deck)      | configurable tri-state modal                                                                              |
| `src/lib/card/bulk/TagListInput.tsx` (new)                                   | chip input (extracted from the deck modal)                                                                |
| `src/lib/card/bulk/BulkSelectOverlay.tsx` + `.module.css` (new)              | checked frame overlay (extracted from the deck's inline styles)                                           |
| `src/lib/card/bulk/SelectModeButton.tsx` (new)                               | "Sélectionner / Terminé" toolbar button                                                                   |
| `src/lib/deck/store/deck-store.ts` + `src/lib/deck/context/DeckContext.tsx`  | `bulkUpdateDeckCards`                                                                                     |
| `src/app/[locale]/decks/[id]/…`                                              | deck moved onto the shared module                                                                         |
| `src/lib/collection/bulk-plans.ts` (new)                                     | `planCollectionRemove`, `planAssignToDeck` (pure)                                                         |
| `src/lib/collection/bulk-actions.ts` (new)                                   | collection bulk actions (stores + queue)                                                                  |
| `src/lib/collection/context/CollectionContext.tsx`                           | binds them                                                                                                |
| `src/lib/wishlist/bulk-plans.ts` (new)                                       | `planWishlistRemove` (pure)                                                                               |
| `src/lib/wishlist/bulk-actions.ts` (new)                                     | wishlist bulk actions                                                                                     |
| `src/lib/wishlist/context/WishlistContext.tsx`                               | binds them                                                                                                |
| `src/lib/collection-index/hooks/useIndexedCollection.ts`                     | exposes `allStacks`                                                                                       |
| `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx`          | `selection` prop                                                                                          |
| `src/app/[locale]/collection/lib/BulkAddToDeckModal/` (new)                  | deck + zone picker with summary                                                                           |
| `src/app/[locale]/collection/page.tsx`, `src/app/[locale]/wishlist/page.tsx` | wiring                                                                                                    |
| `messages/en.json`, `messages/fr.json`                                       | `bulk` namespace                                                                                          |

---

### Task 1: `bulk-edit.ts` — the edit model (pure)

**Files:**

- Create: `src/lib/card/bulk/bulk-edit.ts`
- Test: `src/lib/card/bulk/bulk-edit.test.ts`

**Interfaces:**

- Consumes: `CardEntry`, `CardCondition` (`@/types/cards`), `MtgLanguage` (`@/lib/mtg/languages`), `DECK_ZONE_PREFIX` behaviour of `src/types/decks.ts` (zone tags start with `deck:`; reuse `removeDeckZoneTags` to detect them).
- Produces:
  - `type BulkField = 'condition' | 'language' | 'finish' | 'proxy' | 'forTrade' | 'alter' | 'tagsAdd' | 'tagsRemove' | 'purchasePrice'`
  - `type TriState = '' | 'true' | 'false'`
  - `type BulkEditForm = { condition: CardCondition | ''; language: MtgLanguage | ''; foil: TriState; foilType: 'foil' | 'etched'; proxy: TriState; forTrade: TriState; alter: TriState; addTags: string[]; removeTags: string[]; purchasePrice: string }`
  - `const EMPTY_BULK_EDIT_FORM: BulkEditForm`
  - `type BulkEdit = { set: Partial<Pick<CardEntry, 'condition' | 'language' | 'isFoil' | 'foilType' | 'proxy' | 'forTrade' | 'alter' | 'purchasePrice'>>; addTags: string[]; removeTags: string[] }`
  - `buildBulkEdit(form: BulkEditForm): BulkEdit`
  - `isEmptyBulkEdit(edit: BulkEdit): boolean`
  - `mergeTags(tags: string[] | undefined, add: string[], remove: string[]): string[]`
  - `applyBulkEdit(entry: CardEntry, edit: BulkEdit): CardEntry`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/card/bulk/bulk-edit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import {
	EMPTY_BULK_EDIT_FORM,
	applyBulkEdit,
	buildBulkEdit,
	isEmptyBulkEdit,
	mergeTags,
} from './bulk-edit';

const entry = (over: Partial<CardEntry> = {}): CardEntry => ({
	rowId: 'r1',
	dateAdded: '2026-01-01',
	...over,
});

test('an untouched form builds an empty edit', () => {
	const edit = buildBulkEdit(EMPTY_BULK_EDIT_FORM);
	assert.equal(isEmptyBulkEdit(edit), true);
	assert.deepEqual(edit, { set: {}, addTags: [], removeTags: [] });
});

test('tri-state and selects map to set fields; blank purchase price is ignored', () => {
	const edit = buildBulkEdit({
		...EMPTY_BULK_EDIT_FORM,
		condition: 'NM',
		language: 'French',
		proxy: 'false',
		forTrade: 'true',
		purchasePrice: '  ',
	});
	assert.deepEqual(edit.set, { condition: 'NM', language: 'French', proxy: false, forTrade: true });
});

test('purchase price is trimmed when set', () => {
	assert.equal(
		buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, purchasePrice: ' 1.50 ' }).set.purchasePrice,
		'1.50'
	);
});

test('foil yes carries the chosen type; foil no clears the type', () => {
	assert.deepEqual(
		buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, foil: 'true', foilType: 'etched' }).set,
		{
			isFoil: true,
			foilType: 'etched',
		}
	);
	assert.deepEqual(buildBulkEdit({ ...EMPTY_BULK_EDIT_FORM, foil: 'false' }).set, {
		isFoil: false,
		foilType: undefined,
	});
});

test('mergeTags: remove then add, order kept, add wins, zone tag protected', () => {
	assert.deepEqual(
		mergeTags(['a', 'deck:sideboard', 'b'], ['c', 'b', 'a'], ['a', 'b', 'deck:sideboard']),
		['deck:sideboard', 'c', 'b', 'a']
	);
	assert.deepEqual(mergeTags(undefined, ['x'], []), ['x']);
	assert.deepEqual(mergeTags(['x', 'x'], ['x'], []), ['x']);
});

test('applyBulkEdit sets fields, merges tags, clears foilType on non-foil', () => {
	const before = entry({ isFoil: true, foilType: 'etched', tags: ['old'], condition: 'LP' });
	const after = applyBulkEdit(before, {
		set: { isFoil: false, foilType: undefined },
		addTags: ['new'],
		removeTags: ['old'],
	});
	assert.equal(after.isFoil, false);
	assert.equal(after.foilType, undefined);
	assert.equal(after.condition, 'LP');
	assert.deepEqual(after.tags, ['new']);
	assert.equal(before.isFoil, true, 'input not mutated');
});

test('applyBulkEdit leaves tags untouched when no tag change is asked', () => {
	const before = entry({ tags: ['keep'] });
	assert.equal(
		applyBulkEdit(before, { set: { proxy: true }, addTags: [], removeTags: [] }).tags,
		before.tags
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/card/bulk/bulk-edit.test.ts`
Expected: FAIL — `Cannot find module './bulk-edit'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/card/bulk/bulk-edit.ts
import type { CardCondition, CardEntry } from '@/types/cards';
import type { MtgLanguage } from '@/lib/mtg/languages';
import { removeDeckZoneTags } from '@/types/decks';

/** A field the bulk-edit modal can offer; each list picks its own subset. */
export type BulkField =
	| 'condition'
	| 'language'
	| 'finish'
	| 'proxy'
	| 'forTrade'
	| 'alter'
	| 'tagsAdd'
	| 'tagsRemove'
	| 'purchasePrice';

/** Tri-state select value: '' = leave untouched, 'true'/'false' = override. */
export type TriState = '' | 'true' | 'false';

/** Raw state of the bulk-edit form ('' / empty = leave unchanged). */
export type BulkEditForm = {
	condition: CardCondition | '';
	language: MtgLanguage | '';
	foil: TriState;
	foilType: 'foil' | 'etched';
	proxy: TriState;
	forTrade: TriState;
	alter: TriState;
	addTags: string[];
	removeTags: string[];
	purchasePrice: string;
};

export const EMPTY_BULK_EDIT_FORM: BulkEditForm = {
	condition: '',
	language: '',
	foil: '',
	foilType: 'foil',
	proxy: '',
	forTrade: '',
	alter: '',
	addTags: [],
	removeTags: [],
	purchasePrice: '',
};

/** What to do to every selected copy. Fields absent from `set` are left as-is. */
export type BulkEdit = {
	set: Partial<
		Pick<
			CardEntry,
			| 'condition'
			| 'language'
			| 'isFoil'
			| 'foilType'
			| 'proxy'
			| 'forTrade'
			| 'alter'
			| 'purchasePrice'
		>
	>;
	addTags: string[];
	removeTags: string[];
};

function triToBool(value: TriState): boolean | undefined {
	if (value === '') return undefined;
	return value === 'true';
}

export function buildBulkEdit(form: BulkEditForm): BulkEdit {
	const set: BulkEdit['set'] = {};
	if (form.condition) set.condition = form.condition;
	if (form.language) set.language = form.language;
	const foil = triToBool(form.foil);
	if (foil !== undefined) {
		set.isFoil = foil;
		set.foilType = foil ? form.foilType : undefined;
	}
	const proxy = triToBool(form.proxy);
	if (proxy !== undefined) set.proxy = proxy;
	const forTrade = triToBool(form.forTrade);
	if (forTrade !== undefined) set.forTrade = forTrade;
	const alter = triToBool(form.alter);
	if (alter !== undefined) set.alter = alter;
	const price = form.purchasePrice.trim();
	if (price) set.purchasePrice = price;
	return { set, addTags: [...form.addTags], removeTags: [...form.removeTags] };
}

export function isEmptyBulkEdit(edit: BulkEdit): boolean {
	return (
		Object.keys(edit.set).length === 0 && edit.addTags.length === 0 && edit.removeTags.length === 0
	);
}

/**
 * `(tags − remove) ∪ add`, existing order kept, new tags appended, no
 * duplicates. A deck zone tag (`deck:<zone>`) is never removed.
 */
export function mergeTags(tags: string[] | undefined, add: string[], remove: string[]): string[] {
	const current = tags ?? [];
	const zoneTags = new Set(current.filter((t) => !removeDeckZoneTags([t]).length));
	const removeSet = new Set(remove.filter((t) => !zoneTags.has(t)));
	const out: string[] = [];
	for (const t of current) if (!removeSet.has(t) && !out.includes(t)) out.push(t);
	for (const t of add) if (!out.includes(t)) out.push(t);
	return out;
}

/** The new entry of one copy after the bulk edit. Never mutates `entry`. */
export function applyBulkEdit(entry: CardEntry, edit: BulkEdit): CardEntry {
	const next: CardEntry = { ...entry, ...edit.set };
	if (next.isFoil === false) next.foilType = undefined;
	if (next.isFoil === true && !next.foilType) next.foilType = 'foil';
	if (edit.addTags.length > 0 || edit.removeTags.length > 0) {
		next.tags = mergeTags(entry.tags, edit.addTags, edit.removeTags);
	}
	return next;
}
```

Note on the mergeTags test expectation `['deck:sideboard', 'c', 'b', 'a']`: `a` and `b` are removed from their original positions, the zone tag survives in place, then `c`, `b`, `a` are appended in add order ("add wins").

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/card/bulk/bulk-edit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/bulk/bulk-edit.ts src/lib/card/bulk/bulk-edit.test.ts
git commit -m "feat(bulk): pure bulk edit model (form → edit → entry)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `entryDbPatch` — changed DB columns of one row (pure)

**Files:**

- Create: `src/lib/card/db/entry-db-patch.ts`
- Test: `src/lib/card/db/entry-db-patch.test.ts`

**Interfaces:**

- Consumes: `CardEntry`; `normalizeCondition` from `@/lib/card/db/cardRow`.
- Produces:
  - `type DbPatch = Partial<{ is_foil: boolean | null; foil_type: string | null; condition: string | null; language: string | null; purchase_price: string | null; for_trade: boolean | null; alter: boolean | null; proxy: boolean | null; tags: string[] | null; deck_id: string | null; wishlist: boolean; owner_id: string | null; scryfall_id: string }>`
  - `entryDbPatch(before: CardEntry, after: CardEntry): DbPatch` — never emits `owner_id` / `scryfall_id` (callers add them explicitly).
  - `isEmptyDbPatch(patch: DbPatch): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/card/db/entry-db-patch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { entryDbPatch, isEmptyDbPatch } from './entry-db-patch';

const base: CardEntry = { rowId: 'r', dateAdded: 'd', condition: 'LP', tags: ['a'] };

test('identical entries give an empty patch', () => {
	assert.equal(isEmptyDbPatch(entryDbPatch(base, { ...base, tags: ['a'] })), true);
});

test('only changed columns are emitted, undefined becomes null', () => {
	assert.deepEqual(
		entryDbPatch(
			{ ...base, isFoil: true, foilType: 'etched' },
			{ ...base, condition: 'NM', isFoil: false, foilType: undefined }
		),
		{ condition: 'NM', is_foil: false, foil_type: null }
	);
});

test('tags compare by value; deck and wishlist columns are mapped', () => {
	assert.deepEqual(
		entryDbPatch(base, { ...base, tags: ['a', 'deck:mainboard'], deckId: 'D', wishlist: false }),
		{ tags: ['a', 'deck:mainboard'], deck_id: 'D' }
	);
	assert.deepEqual(entryDbPatch({ ...base, wishlist: true }, { ...base, wishlist: false }), {
		wishlist: false,
	});
});

test('for_trade / alter / proxy / purchase_price / language', () => {
	assert.deepEqual(
		entryDbPatch(base, {
			...base,
			forTrade: true,
			alter: true,
			proxy: false,
			purchasePrice: '2',
			language: 'French',
		}),
		{ for_trade: true, alter: true, proxy: false, purchase_price: '2', language: 'French' }
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/card/db/entry-db-patch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/card/db/entry-db-patch.ts
import type { CardEntry } from '@/types/cards';
import { normalizeCondition } from '@/lib/card/db/cardRow';

/** `card_entries` columns a bulk update may write. */
export type DbPatch = Partial<{
	is_foil: boolean | null;
	foil_type: string | null;
	condition: string | null;
	language: string | null;
	purchase_price: string | null;
	for_trade: boolean | null;
	alter: boolean | null;
	proxy: boolean | null;
	tags: string[] | null;
	deck_id: string | null;
	wishlist: boolean;
	owner_id: string | null;
	scryfall_id: string;
}>;

/** Column values of an entry, in the shape `updateEntry` already writes. */
function columns(e: CardEntry) {
	return {
		is_foil: e.isFoil ?? null,
		foil_type: e.foilType ?? null,
		condition: normalizeCondition(e.condition),
		language: e.language ?? null,
		purchase_price: e.purchasePrice ?? null,
		for_trade: e.forTrade ?? null,
		alter: e.alter ?? null,
		proxy: e.proxy ?? null,
		tags: e.tags ?? null,
		deck_id: e.deckId ?? null,
		wishlist: e.wishlist ?? false,
	};
}

/**
 * The columns that differ between two versions of the same row. `owner_id` and
 * `scryfall_id` are not part of `CardEntry`'s editable state: callers that change
 * them add them to the patch explicitly.
 */
export function entryDbPatch(before: CardEntry, after: CardEntry): DbPatch {
	const a = columns(before);
	const b = columns(after);
	const patch: Record<string, unknown> = {};
	for (const key of Object.keys(b) as Array<keyof typeof b>) {
		if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key];
	}
	return patch as DbPatch;
}

export function isEmptyDbPatch(patch: DbPatch): boolean {
	return Object.keys(patch).length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/card/db/entry-db-patch.test.ts`
Expected: PASS (4 tests). If `normalizeCondition` import pulls a module that fails under `tsx` (it imports only `@/lib/mtg/languages`), report it rather than inlining a copy.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/db/entry-db-patch.ts src/lib/card/db/entry-db-patch.test.ts
git commit -m "feat(bulk): entryDbPatch — changed card_entries columns of one row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `bulk-update` sync op (grouping, query, executor)

**Files:**

- Create: `src/lib/supabase/group-row-updates.ts`
- Test: `src/lib/supabase/group-row-updates.test.ts`
- Modify: `src/lib/supabase/sync-queue.ts` (the `SyncOp` union, after the `bulk-delete` variant ~line 50)
- Modify: `src/lib/supabase/queries/cards.ts` (after `updateCardRow`, ~line 169)
- Modify: `src/lib/supabase/useSyncQueue.ts` (`executeOp`, before the final `else`)

**Interfaces:**

- Consumes: `DbPatch` (Task 2).
- Produces:
  - `type BulkUpdateRow = { rowId: string; updates: DbPatch }`
  - `groupRowUpdates(rows: BulkUpdateRow[], chunkSize?: number): Array<{ updates: DbPatch; rowIds: string[] }>` (default chunk 200)
  - SyncOp variant `{ type: 'bulk-update'; payload: { rows: BulkUpdateRow[] } }` → enqueue as `enqueue({ type: 'bulk-update', payload: { rows } })`
  - `updateCardRowsByIds(ids: string[], payload: Record<string, unknown>): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/supabase/group-row-updates.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRowUpdates } from './group-row-updates';

test('rows with the same patch share one group, key order ignored', () => {
	const groups = groupRowUpdates([
		{ rowId: 'a', updates: { condition: 'NM', proxy: true } },
		{ rowId: 'b', updates: { proxy: true, condition: 'NM' } },
		{ rowId: 'c', updates: { condition: 'LP' } },
	]);
	assert.equal(groups.length, 2);
	assert.deepEqual(groups[0], { updates: { condition: 'NM', proxy: true }, rowIds: ['a', 'b'] });
	assert.deepEqual(groups[1], { updates: { condition: 'LP' }, rowIds: ['c'] });
});

test('tag arrays are part of the identity (order matters)', () => {
	const groups = groupRowUpdates([
		{ rowId: 'a', updates: { tags: ['x', 'y'] } },
		{ rowId: 'b', updates: { tags: ['y', 'x'] } },
	]);
	assert.equal(groups.length, 2);
});

test('groups are chunked', () => {
	const rows = Array.from({ length: 450 }, (_, i) => ({
		rowId: `r${i}`,
		updates: { proxy: true },
	}));
	const groups = groupRowUpdates(rows, 200);
	assert.deepEqual(
		groups.map((g) => g.rowIds.length),
		[200, 200, 50]
	);
});

test('empty patches are dropped', () => {
	assert.deepEqual(groupRowUpdates([{ rowId: 'a', updates: {} }]), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/supabase/group-row-updates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `group-row-updates.ts`**

```ts
// src/lib/supabase/group-row-updates.ts
import type { DbPatch } from '@/lib/card/db/entry-db-patch';

export type BulkUpdateRow = { rowId: string; updates: DbPatch };

/** PostgREST rejects an `in()` list of ~300 uuids (414); 200 is the house chunk. */
export const BULK_UPDATE_CHUNK = 200;

function stableKey(updates: DbPatch): string {
	const sorted = Object.keys(updates)
		.sort()
		.map((k) => [k, updates[k as keyof DbPatch]]);
	return JSON.stringify(sorted);
}

/**
 * Groups rows that receive the exact same patch, so each group is written with a
 * single `update … where id in (…)` per chunk. Empty patches are dropped.
 */
export function groupRowUpdates(
	rows: BulkUpdateRow[],
	chunkSize: number = BULK_UPDATE_CHUNK
): Array<{ updates: DbPatch; rowIds: string[] }> {
	const byKey = new Map<string, { updates: DbPatch; rowIds: string[] }>();
	for (const row of rows) {
		if (Object.keys(row.updates).length === 0) continue;
		const key = stableKey(row.updates);
		const group = byKey.get(key);
		if (group) group.rowIds.push(row.rowId);
		else byKey.set(key, { updates: row.updates, rowIds: [row.rowId] });
	}
	const out: Array<{ updates: DbPatch; rowIds: string[] }> = [];
	for (const group of byKey.values()) {
		for (let i = 0; i < group.rowIds.length; i += chunkSize) {
			out.push({ updates: group.updates, rowIds: group.rowIds.slice(i, i + chunkSize) });
		}
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/supabase/group-row-updates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the op variant to `sync-queue.ts`**

Add the import at the top and the variant right after the `bulk-delete` variant:

```ts
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
```

```ts
	| {
			id: string;
			type: 'bulk-update';
			/**
			 * Per-row column patches, written grouped by identical patch and matched
			 * on `id` only (like `deck-card-update`): rows with owner_id = NULL
			 * (wishlisted deck cards) are reachable; RLS protects the rest.
			 */
			payload: { rows: BulkUpdateRow[] };
			retries: number;
			createdAt: string;
	  }
```

- [ ] **Step 6: Add the query to `queries/cards.ts`** (after `updateCardRow`)

```ts
/** `update(payload) where id in (ids)` — callers chunk `ids` (≤ 200). */
export async function updateCardRowsByIds(
	ids: string[],
	payload: Record<string, unknown>
): Promise<void> {
	if (ids.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('card_entries').update(payload).in('id', ids);
	if (error) {
		throw new Error(`[queries/cards] updateCardRowsByIds error: ${error.message}`);
	}
}
```

- [ ] **Step 7: Execute it in `useSyncQueue.ts`**

Imports:

```ts
import { updateCardRowsByIds } from '@/lib/supabase/queries/cards';
import { groupRowUpdates } from '@/lib/supabase/group-row-updates';
```

In `executeOp`, add a branch right after the `bulk-delete` branch (it must come before the final `else`, which assumes `update`):

```ts
	} else if (op.type === 'bulk-update') {
		for (const group of groupRowUpdates(op.payload.rows)) {
			await updateCardRowsByIds(group.rowIds, group.updates);
		}
```

Every write is an absolute value, so a retry after a partial failure converges.

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "sync-queue|useSyncQueue|queries/cards|group-row-updates" ; npx eslint src/lib/supabase/sync-queue.ts src/lib/supabase/useSyncQueue.ts src/lib/supabase/queries/cards.ts src/lib/supabase/group-row-updates.ts`
Expected: no output from the grep, eslint clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase/group-row-updates.ts src/lib/supabase/group-row-updates.test.ts src/lib/supabase/sync-queue.ts src/lib/supabase/queries/cards.ts src/lib/supabase/useSyncQueue.ts
git commit -m "feat(sync): bulk-update op grouped by identical patch, chunked by 200

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Generic selection (`rowIdsOfSelected`, `useBulkSelection`, `useStackSelection`)

**Files:**

- Create: `src/lib/card/bulk/selection.ts`
- Create: `src/lib/card/bulk/useBulkSelection.ts`
- Create: `src/lib/card/bulk/useStackSelection.ts`
- Test: `src/lib/card/bulk/selection.test.ts`

**Interfaces:**

- Produces:
  - `rowIdsOfSelected<S, C extends { entry: { rowId: string } }>(selected: ReadonlySet<string>, stackByKey: ReadonlyMap<string, S>, copiesOf: (stack: S) => readonly C[], predicate?: (copy: C) => boolean): string[]`
  - `useBulkSelection(resetKey: string)` → `{ selectMode, selected, toggle(key), clear(), enter(), exit(), toggleMode(), toggleSelectAll(keys), toggleKeys(keys), areAllSelected(keys) }` (same names as the deck hook, minus `selectedRowIds`)
  - `useStackSelection(stacks: FacetStack[], resetKey: string)` → `{ ...useBulkSelection, stackByKey: Map<string, FacetStack>, allKeys: string[], allSelected: boolean, stackCount: number, selectedCopies: FacetCopy[], selectedRowIds: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/card/bulk/selection.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowIdsOfSelected } from './selection';

type Copy = { entry: { rowId: string; ownerId?: string } };
type Stack = { copies: Copy[] };
const c = (rowId: string, owned = false): Copy => ({
	entry: { rowId, ownerId: owned ? 'u' : undefined },
});

const stacks = new Map<string, Stack>([
	['sol|foil', { copies: [c('f1')] }],
	['sol|nonfoil', { copies: [c('n1', true), c('n2')] }],
]);
const copiesOf = (s: Stack) => s.copies;

test('a selected stack resolves to its own copies only', () => {
	assert.deepEqual(rowIdsOfSelected(new Set(['sol|nonfoil']), stacks, copiesOf), ['n1', 'n2']);
});

test('stale keys are ignored; predicate filters copies', () => {
	assert.deepEqual(
		rowIdsOfSelected(new Set(['sol|nonfoil', 'gone']), stacks, copiesOf, (x) => !x.entry.ownerId),
		['n2']
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/card/bulk/selection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `selection.ts`**

```ts
// src/lib/card/bulk/selection.ts

/**
 * Flat list of the `rowId`s behind the selected stack keys. Stale keys (a stack
 * that no longer exists) are ignored; `predicate` filters which copies to keep.
 */
export function rowIdsOfSelected<S, C extends { entry: { rowId: string } }>(
	selected: ReadonlySet<string>,
	stackByKey: ReadonlyMap<string, S>,
	copiesOf: (stack: S) => readonly C[],
	predicate?: (copy: C) => boolean
): string[] {
	const rowIds: string[] = [];
	for (const key of selected) {
		const stack = stackByKey.get(key);
		if (!stack) continue;
		for (const copy of copiesOf(stack)) {
			if (predicate && !predicate(copy)) continue;
			rowIds.push(copy.entry.rowId);
		}
	}
	return rowIds;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/card/bulk/selection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `useBulkSelection.ts`**

Same API as `src/app/[locale]/decks/[id]/useDeckBulkSelection.ts` (minus `selectedRowIds`), plus the render-time reset:

```ts
// src/lib/card/bulk/useBulkSelection.ts
import { useCallback, useState } from 'react';

/**
 * Selection state for a bulk-action mode, keyed by displayed stack. The
 * selection is cleared at render time whenever `resetKey` changes (stacking
 * criteria, filters): stack keys depend on them, so old keys would point at
 * other copies or nothing.
 */
export function useBulkSelection(resetKey: string) {
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [prevResetKey, setPrevResetKey] = useState(resetKey);
	if (prevResetKey !== resetKey) {
		setPrevResetKey(resetKey);
		setSelected(new Set());
	}

	const toggle = useCallback((key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const clear = useCallback(() => setSelected(new Set()), []);
	const enter = useCallback(() => setSelectMode(true), []);
	const exit = useCallback(() => {
		setSelectMode(false);
		setSelected(new Set());
	}, []);
	const toggleMode = useCallback(() => {
		setSelectMode((on) => {
			if (on) setSelected(new Set());
			return !on;
		});
	}, []);

	/** Select all `allKeys` unless every one is already selected, then clear. */
	const toggleSelectAll = useCallback((allKeys: string[]) => {
		setSelected((prev) => {
			const allSelected = allKeys.length > 0 && allKeys.every((k) => prev.has(k));
			return allSelected ? new Set() : new Set(allKeys);
		});
	}, []);

	/** Toggle a subset together: all selected → remove them, else add them. */
	const toggleKeys = useCallback((keys: string[]) => {
		setSelected((prev) => {
			const next = new Set(prev);
			const allSelected = keys.length > 0 && keys.every((k) => next.has(k));
			for (const k of keys) {
				if (allSelected) next.delete(k);
				else next.add(k);
			}
			return next;
		});
	}, []);

	const areAllSelected = useCallback(
		(keys: string[]) => keys.length > 0 && keys.every((k) => selected.has(k)),
		[selected]
	);

	return {
		selectMode,
		selected,
		toggle,
		clear,
		enter,
		exit,
		toggleMode,
		toggleSelectAll,
		toggleKeys,
		areAllSelected,
	};
}
```

- [ ] **Step 6: Write `useStackSelection.ts`**

```ts
// src/lib/card/bulk/useStackSelection.ts
import { useMemo } from 'react';
import type { FacetCopy, FacetStack } from '@/types/cards';
import { useBulkSelection } from './useBulkSelection';
import { rowIdsOfSelected } from './selection';

const copiesOf = (stack: FacetStack) => stack.cards;

/**
 * Bulk selection over the in-memory facet stacks of a list (collection or
 * wishlist): every filtered stack, loaded page or not. Keys are `stack.key`.
 */
export function useStackSelection(stacks: FacetStack[], resetKey: string) {
	const bulk = useBulkSelection(resetKey);

	const stackByKey = useMemo(() => {
		const map = new Map<string, FacetStack>();
		for (const stack of stacks) map.set(stack.key, stack);
		return map;
	}, [stacks]);

	const allKeys = useMemo(() => stacks.map((s) => s.key), [stacks]);

	const { selectedCopies, stackCount } = useMemo(() => {
		const copies: FacetCopy[] = [];
		let count = 0;
		for (const key of bulk.selected) {
			const stack = stackByKey.get(key);
			if (!stack) continue;
			count += 1;
			copies.push(...stack.cards);
		}
		return { selectedCopies: copies, stackCount: count };
	}, [bulk.selected, stackByKey]);

	const selectedRowIds = useMemo(
		() => rowIdsOfSelected(bulk.selected, stackByKey, copiesOf),
		[bulk.selected, stackByKey]
	);

	const allSelected = allKeys.length > 0 && allKeys.every((k) => bulk.selected.has(k));

	return { ...bulk, stackByKey, allKeys, allSelected, stackCount, selectedCopies, selectedRowIds };
}
```

- [ ] **Step 7: Lint**

Run: `npx eslint src/lib/card/bulk/`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/card/bulk/selection.ts src/lib/card/bulk/selection.test.ts src/lib/card/bulk/useBulkSelection.ts src/lib/card/bulk/useStackSelection.ts
git commit -m "feat(bulk): shared selection hook with render-time reset, facet-stack selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared UI — `bulk` i18n namespace, `BulkActionBar`, `BulkEditModal`, `TagListInput`, `BulkSelectOverlay`, `SelectModeButton`

**Files:**

- Move: `src/app/[locale]/decks/[id]/components/DeckBulkActionBar/DeckBulkActionBar.module.css` → `src/lib/card/bulk/BulkActionBar.module.css` (`git mv`)
- Move: `src/app/[locale]/decks/[id]/components/DeckBulkEditModal/DeckBulkEditModal.module.css` → `src/lib/card/bulk/BulkEditModal.module.css` (`git mv`)
- Create: `src/lib/card/bulk/BulkActionBar.tsx`, `BulkEditModal.tsx`, `TagListInput.tsx`, `BulkSelectOverlay.tsx`, `BulkSelectOverlay.module.css`, `SelectModeButton.tsx`
- Modify: `messages/en.json`, `messages/fr.json` (new top-level `"bulk"` object)
- Temporarily keep the deck components compiling: after the `git mv`, the deck files import CSS that no longer exists — Task 6 rewrites them. To keep every commit buildable, **do Task 5 and Task 6 in the same commit** (Step 9 below is folded into Task 6's commit).

**Interfaces:**

- Consumes: `BulkEdit`, `BulkEditForm`, `BulkField`, `TriState`, `EMPTY_BULK_EDIT_FORM`, `buildBulkEdit`, `isEmptyBulkEdit` (Task 1).
- Produces:
  - `BulkActionBar(props: { summary: string; allSelected: boolean; selectAllDisabled?: boolean; onToggleSelectAll(): void; actions: BulkAction[]; hasSelection: boolean; onClear(): void; onExit(): void; escapeDisabled?: boolean })`, `type BulkAction = { id: string; label: ReactNode; onClick(): void; danger?: boolean }`
  - `BulkEditModal(props: { title: string; fields: readonly BulkField[]; extraFields?: ReactNode; extraHasChanges?: boolean; onApply(edit: BulkEdit): void; onClose(): void })`
  - `TagListInput(props: { id: string; label: string; tags: string[]; onChange(tags: string[]): void })`
  - `BulkSelectOverlay(props: { checked: boolean })`
  - `SelectModeButton(props: { active: boolean; onToggle(): void })`

- [ ] **Step 1: Add the `bulk` namespace to `messages/en.json`** (top-level key, next to `"decks"`)

```json
	"bulk": {
		"select": "Select",
		"done": "Done",
		"exitSelectionMode": "Exit selection mode",
		"selectAll": "Select all",
		"deselectAll": "Deselect all",
		"clear": "Clear",
		"summary": "{stacks, plural, one {# card} other {# cards}} · {copies, plural, one {# copy} other {# copies}}",
		"edit": "Edit",
		"remove": "Remove",
		"addToDeck": "Add to a deck",
		"moveToCollection": "Move to collection",
		"editTitle": "Edit {count, plural, one {# copy} other {# copies}}",
		"close": "Close",
		"leaveUnchangedHint": "Fields left on “leave unchanged” are not modified.",
		"leaveUnchanged": "— leave unchanged —",
		"tagsAdd": "Tags to add",
		"tagsRemove": "Tags to remove",
		"addTags": "Add tags…",
		"removeTag": "Remove tag {tag}",
		"condition": "Condition",
		"language": "Language",
		"foil": "Foil",
		"foilType": "Foil type",
		"yes": "Yes",
		"no": "No",
		"proxy": "Proxy",
		"forTrade": "For trade",
		"altered": "Altered",
		"purchasePrice": "Purchase price",
		"zone": "Zone",
		"cancel": "Cancel",
		"apply": "Apply",
		"confirm": "Confirm",
		"confirmRemoveCollection": "Remove {count, plural, one {# copy} other {# copies}} from the collection?",
		"detachNotice": "{count, plural, one {# copy stays in its deck} other {# copies stay in their deck}} as unowned.",
		"confirmRemoveWishlist": "Remove {count, plural, one {# copy} other {# copies}} from the wishlist?",
		"confirmMoveToCollection": "Move {count, plural, one {# copy} other {# copies}} to the collection?",
		"addToDeckTitle": "Add {count, plural, one {# copy} other {# copies}} to a deck",
		"deck": "Deck",
		"movedFromDeck": "{count, plural, one {# copy moves} other {# copies move}} from {deck}",
		"alreadyInDeck": "{count, plural, one {# copy is} other {# copies are}} already in this deck (zone updated)",
		"noDecks": "You have no deck yet.",
		"goToDecks": "Go to my decks"
	},
```

- [ ] **Step 2: Same keys in `messages/fr.json`**

```json
	"bulk": {
		"select": "Sélectionner",
		"done": "Terminé",
		"exitSelectionMode": "Quitter le mode sélection",
		"selectAll": "Tout sélectionner",
		"deselectAll": "Tout désélectionner",
		"clear": "Effacer",
		"summary": "{stacks, plural, one {# carte} other {# cartes}} · {copies, plural, one {# copie} other {# copies}}",
		"edit": "Modifier",
		"remove": "Retirer",
		"addToDeck": "Ajouter à un deck",
		"moveToCollection": "Déplacer vers la collection",
		"editTitle": "Modifier {count, plural, one {# copie} other {# copies}}",
		"close": "Fermer",
		"leaveUnchangedHint": "Les champs laissés sur « inchangé » ne sont pas modifiés.",
		"leaveUnchanged": "— inchangé —",
		"tagsAdd": "Tags à ajouter",
		"tagsRemove": "Tags à retirer",
		"addTags": "Ajouter des tags…",
		"removeTag": "Retirer le tag {tag}",
		"condition": "État",
		"language": "Langue",
		"foil": "Foil",
		"foilType": "Type de foil",
		"yes": "Oui",
		"no": "Non",
		"proxy": "Proxy",
		"forTrade": "À l’échange",
		"altered": "Altérée",
		"purchasePrice": "Prix d’achat",
		"zone": "Zone",
		"cancel": "Annuler",
		"apply": "Appliquer",
		"confirm": "Confirmer",
		"confirmRemoveCollection": "Retirer {count, plural, one {# copie} other {# copies}} de la collection ?",
		"detachNotice": "{count, plural, one {# copie restera dans son deck} other {# copies resteront dans leur deck}}, comme non possédée{count, plural, one {} other {s}}.",
		"confirmRemoveWishlist": "Retirer {count, plural, one {# copie} other {# copies}} de la wishlist ?",
		"confirmMoveToCollection": "Déplacer {count, plural, one {# copie} other {# copies}} vers la collection ?",
		"addToDeckTitle": "Ajouter {count, plural, one {# copie} other {# copies}} à un deck",
		"deck": "Deck",
		"movedFromDeck": "{count, plural, one {# copie déplacée} other {# copies déplacées}} depuis {deck}",
		"alreadyInDeck": "{count, plural, one {# copie déjà} other {# copies déjà}} dans ce deck (zone mise à jour)",
		"noDecks": "Vous n’avez pas encore de deck.",
		"goToDecks": "Voir mes decks"
	},
```

Check the JSON stays valid: `node -e "require('./messages/en.json');require('./messages/fr.json')"`.

- [ ] **Step 3: Move the two CSS modules**

```bash
git mv "src/app/[locale]/decks/[id]/components/DeckBulkActionBar/DeckBulkActionBar.module.css" src/lib/card/bulk/BulkActionBar.module.css
git mv "src/app/[locale]/decks/[id]/components/DeckBulkEditModal/DeckBulkEditModal.module.css" src/lib/card/bulk/BulkEditModal.module.css
```

The class names used below are exactly those of the moved files (`bar exit count action divider danger clear` / `modal header title closeIcon body hint field label tagsField tag tagRemove tagInput grid select footer cancelBtn applyBtn`). Add one rule to `BulkEditModal.module.css` for the price input, so it matches the selects:

```css
.input {
	composes: select;
}
```

If `composes` is not used anywhere else in the repo (`grep -rn "composes:" src | head`), copy the `.select` declarations into `.input` instead.

- [ ] **Step 4: `BulkActionBar.tsx`**

```tsx
// src/lib/card/bulk/BulkActionBar.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import styles from './BulkActionBar.module.css';

export type BulkAction = {
	id: string;
	label: ReactNode;
	onClick: () => void;
	danger?: boolean;
};

type Props = {
	/** Counter text, e.g. "12 cartes · 31 copies". */
	summary: string;
	allSelected: boolean;
	selectAllDisabled?: boolean;
	onToggleSelectAll: () => void;
	/** Per-selection actions, disabled while nothing is selected. */
	actions: BulkAction[];
	hasSelection: boolean;
	onClear: () => void;
	/** Leave selection mode entirely (clears the selection too). */
	onExit: () => void;
	/** True while a modal is open on top: Escape then belongs to the modal. */
	escapeDisabled?: boolean;
};

/** Floating action bar shown while a list is in bulk-selection mode. */
export function BulkActionBar({
	summary,
	allSelected,
	selectAllDisabled = false,
	onToggleSelectAll,
	actions,
	hasSelection,
	onClear,
	onExit,
	escapeDisabled = false,
}: Props) {
	const t = useTranslations('bulk');

	useEffect(() => {
		if (escapeDisabled) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onExit();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [escapeDisabled, onExit]);

	return (
		<div className={styles.bar}>
			<button
				type="button"
				className={styles.exit}
				onClick={onExit}
				aria-label={t('exitSelectionMode')}
				title={t('exitSelectionMode')}
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			<span className={styles.count}>{summary}</span>

			<button
				type="button"
				className={styles.action}
				onClick={onToggleSelectAll}
				disabled={selectAllDisabled}
			>
				{allSelected ? t('deselectAll') : t('selectAll')}
			</button>

			<span className={styles.divider} aria-hidden="true" />

			{actions.map((action) => (
				<button
					key={action.id}
					type="button"
					className={action.danger ? `${styles.action} ${styles.danger}` : styles.action}
					onClick={action.onClick}
					disabled={!hasSelection}
				>
					{action.label}
				</button>
			))}

			<span className={styles.divider} aria-hidden="true" />

			<button type="button" className={styles.clear} onClick={onClear} disabled={!hasSelection}>
				{t('clear')}
			</button>
		</div>
	);
}
```

- [ ] **Step 5: `TagListInput.tsx`** (logic lifted from `DeckBulkEditModal`)

```tsx
// src/lib/card/bulk/TagListInput.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './BulkEditModal.module.css';

type Props = {
	id: string;
	label: string;
	tags: string[];
	onChange: (tags: string[]) => void;
};

/** Chip input: Enter or "," adds a tag, Backspace on empty input removes the last. */
export function TagListInput({ id, label, tags, onChange }: Props) {
	const t = useTranslations('bulk');
	const [input, setInput] = useState('');

	function commit() {
		const tag = input.trim().replace(/,$/, '');
		if (tag && !tags.includes(tag)) onChange([...tags, tag]);
		setInput('');
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
			e.preventDefault();
			commit();
		} else if (e.key === 'Backspace' && !input && tags.length > 0) {
			onChange(tags.slice(0, -1));
		}
	}

	return (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<div className={styles.tagsField}>
				{tags.map((tag) => (
					<span key={tag} className={styles.tag}>
						{tag}
						<button
							type="button"
							className={styles.tagRemove}
							onClick={() => onChange(tags.filter((x) => x !== tag))}
							aria-label={t('removeTag', { tag })}
						>
							×
						</button>
					</span>
				))}
				<input
					id={id}
					type="text"
					className={styles.tagInput}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={commit}
					placeholder={tags.length === 0 ? t('addTags') : ''}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 6: `BulkEditModal.tsx`**

```tsx
// src/lib/card/bulk/BulkEditModal.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import type { CardCondition } from '@/types/cards';
import { MTG_LANGUAGES, type MtgLanguage } from '@/lib/mtg/languages';
import {
	EMPTY_BULK_EDIT_FORM,
	buildBulkEdit,
	isEmptyBulkEdit,
	type BulkEdit,
	type BulkEditForm,
	type BulkField,
	type TriState,
} from './bulk-edit';
import { TagListInput } from './TagListInput';
import styles from './BulkEditModal.module.css';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];

type Props = {
	title: string;
	/** Fields offered, in display order of the grid (tags are always on top). */
	fields: readonly BulkField[];
	/** Extra controls rendered first in the grid (the deck's zone picker). */
	extraFields?: ReactNode;
	/** Whether the extra controls hold a change (enables "Apply" on their own). */
	extraHasChanges?: boolean;
	onApply: (edit: BulkEdit) => void;
	onClose: () => void;
};

/**
 * Bulk-edit modal shared by deck, collection and wishlist. Every field is
 * tri-state / optional: an untouched field is left as-is on every copy.
 */
export function BulkEditModal({
	title,
	fields,
	extraFields,
	extraHasChanges = false,
	onApply,
	onClose,
}: Props) {
	const t = useTranslations('bulk');
	const [form, setForm] = useState<BulkEditForm>(EMPTY_BULK_EDIT_FORM);
	const has = (f: BulkField) => fields.includes(f);
	const update = <K extends keyof BulkEditForm>(key: K, value: BulkEditForm[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const edit = buildBulkEdit(form);
	const canApply = extraHasChanges || !isEmptyBulkEdit(edit);

	function handleApply() {
		if (!canApply) return;
		onApply(edit);
		onClose();
	}

	const triSelect = (id: string, label: string, key: 'foil' | 'proxy' | 'forTrade' | 'alter') => (
		<div className={styles.field}>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<select
				id={id}
				className={styles.select}
				value={form[key]}
				onChange={(e) => update(key, e.target.value as TriState)}
			>
				<option value="">{t('leaveUnchanged')}</option>
				<option value="true">{t('yes')}</option>
				<option value="false">{t('no')}</option>
			</select>
		</div>
	);

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
				<button
					type="button"
					className={styles.closeIcon}
					onClick={onClose}
					aria-label={t('close')}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				<p className={styles.hint}>{t('leaveUnchangedHint')}</p>

				{has('tagsAdd') && (
					<TagListInput
						id="bulk-edit-tags-add"
						label={t('tagsAdd')}
						tags={form.addTags}
						onChange={(tags) => update('addTags', tags)}
					/>
				)}
				{has('tagsRemove') && (
					<TagListInput
						id="bulk-edit-tags-remove"
						label={t('tagsRemove')}
						tags={form.removeTags}
						onChange={(tags) => update('removeTags', tags)}
					/>
				)}

				<div className={styles.grid}>
					{extraFields}

					{has('condition') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-condition">
								{t('condition')}
							</label>
							<select
								id="bulk-edit-condition"
								className={styles.select}
								value={form.condition}
								onChange={(e) => update('condition', e.target.value as CardCondition | '')}
							>
								<option value="">{t('leaveUnchanged')}</option>
								{CONDITIONS.map((c) => (
									<option key={c} value={c}>
										{c}
									</option>
								))}
							</select>
						</div>
					)}

					{has('language') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-language">
								{t('language')}
							</label>
							<select
								id="bulk-edit-language"
								className={styles.select}
								value={form.language}
								onChange={(e) => update('language', e.target.value as MtgLanguage | '')}
							>
								<option value="">{t('leaveUnchanged')}</option>
								{MTG_LANGUAGES.map((lang) => (
									<option key={lang} value={lang}>
										{lang}
									</option>
								))}
							</select>
						</div>
					)}

					{has('finish') && triSelect('bulk-edit-foil', t('foil'), 'foil')}

					{has('finish') && form.foil === 'true' && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-foiltype">
								{t('foilType')}
							</label>
							<select
								id="bulk-edit-foiltype"
								className={styles.select}
								value={form.foilType}
								onChange={(e) => update('foilType', e.target.value as 'foil' | 'etched')}
							>
								<option value="foil">foil</option>
								<option value="etched">etched</option>
							</select>
						</div>
					)}

					{has('proxy') && triSelect('bulk-edit-proxy', t('proxy'), 'proxy')}
					{has('forTrade') && triSelect('bulk-edit-fortrade', t('forTrade'), 'forTrade')}
					{has('alter') && triSelect('bulk-edit-alter', t('altered'), 'alter')}

					{has('purchasePrice') && (
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-edit-price">
								{t('purchasePrice')}
							</label>
							<input
								id="bulk-edit-price"
								type="text"
								inputMode="decimal"
								className={styles.input}
								value={form.purchasePrice}
								placeholder={t('leaveUnchanged')}
								onChange={(e) => update('purchasePrice', e.target.value)}
							/>
						</div>
					)}
				</div>
			</div>

			<div className={styles.footer}>
				<button type="button" className={styles.cancelBtn} onClick={onClose}>
					{t('cancel')}
				</button>
				<button
					type="button"
					className={styles.applyBtn}
					onClick={handleApply}
					disabled={!canApply}
				>
					{t('apply')}
				</button>
			</div>
		</Modal>
	);
}
```

- [ ] **Step 7: `BulkSelectOverlay.tsx` + CSS** (the deck's inline styles, `DeckDetailOwnerView.tsx` ~lines 474-500)

```css
/* src/lib/card/bulk/BulkSelectOverlay.module.css */
.overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
	display: flex;
	align-items: flex-start;
	justify-content: flex-start;
	padding: 8px;
	background: transparent;
	border: 2px solid transparent;
	border-radius: 4px;
	box-sizing: border-box;
}

.checked {
	background: rgba(124, 106, 245, 0.18);
	border-color: rgba(124, 106, 245, 0.7);
}

.box {
	width: 18px;
	height: 18px;
	pointer-events: none;
}
```

```tsx
// src/lib/card/bulk/BulkSelectOverlay.tsx
import styles from './BulkSelectOverlay.module.css';

/** Checked frame + checkbox drawn over a tile in selection mode. */
export function BulkSelectOverlay({ checked }: { checked: boolean }) {
	return (
		<div className={checked ? `${styles.overlay} ${styles.checked}` : styles.overlay}>
			<input type="checkbox" className={styles.box} checked={checked} readOnly tabIndex={-1} />
		</div>
	);
}
```

- [ ] **Step 8: `SelectModeButton.tsx`**

```tsx
// src/lib/card/bulk/SelectModeButton.tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';

/** Toolbar toggle for a list's selection mode. */
export function SelectModeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
	const t = useTranslations('bulk');
	return (
		<Button variant="secondary" size="sm" onClick={onToggle} aria-pressed={active}>
			{active ? t('done') : t('select')}
		</Button>
	);
}
```

Check `Button` forwards `aria-pressed` (`grep -n "props\|\.\.\.rest" src/components/Button/Button.tsx`). If it does not spread extra props, wrap the label in a `<span aria-pressed>`-free version and drop `aria-pressed` — do not change `Button`.

- [ ] **Step 9: No commit yet** — continue with Task 6 (the deck still imports the moved CSS).

---

### Task 6: Deck moves onto the shared module + `bulkUpdateDeckCards`

**Files:**

- Modify: `src/lib/deck/store/deck-store.ts` (type `DeckActions` ~line 157, implementation after `updateDeckCard` ~line 587)
- Modify: `src/lib/deck/context/DeckContext.tsx` (type ~line 63, binding ~line 230, value ~line 305)
- Modify: `src/app/[locale]/decks/[id]/components/DeckBulkEditModal/DeckBulkEditModal.tsx` (becomes a thin wrapper)
- Delete: `src/app/[locale]/decks/[id]/components/DeckBulkActionBar/DeckBulkActionBar.tsx`
- Delete: `src/app/[locale]/decks/[id]/useDeckBulkSelection.ts`, `src/app/[locale]/decks/[id]/deck-bulk-selection.test.ts` (covered by `src/lib/card/bulk/selection.test.ts`)
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- Consumes: Task 1 (`BulkEdit`, `applyBulkEdit`), Task 2 (`entryDbPatch`, `isEmptyDbPatch`), Task 3 (`bulk-update` op), Task 4 (`useBulkSelection`, `rowIdsOfSelected`), Task 5 (components).
- Produces:
  - store: `bulkUpdateDeckCards(rowIds: string[], edit: BulkEdit, zone: DeckZone | undefined, triggerSync: () => void): void`
  - context: `bulkUpdateDeckCards(rowIds: string[], edit: BulkEdit, zone?: DeckZone): void`
  - `DeckBulkEdit = { edit: BulkEdit; zone?: DeckZone }`

- [ ] **Step 1: Store action** — in `deck-store.ts` add imports and the action:

```ts
import { applyBulkEdit, type BulkEdit } from '@/lib/card/bulk/bulk-edit';
import { entryDbPatch, isEmptyDbPatch } from '@/lib/card/db/entry-db-patch';
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
```

Type (next to `updateDeckCard`):

```ts
	bulkUpdateDeckCards: (
		rowIds: string[],
		edit: BulkEdit,
		zone: DeckZone | undefined,
		triggerSync: () => void
	) => void;
```

Implementation (after `updateDeckCard`):

```ts
	bulkUpdateDeckCards: (rowIds, edit, zone, triggerSync) => {
		const decksCards = { ...get().decksCards };
		const rows: BulkUpdateRow[] = [];
		for (const rowId of rowIds) {
			const found = findDeckOfRow(decksCards, rowId);
			if (!found) continue;
			const { deckId, copy } = found;
			let entry = applyBulkEdit(copy.entry, edit);
			if (zone) entry = { ...entry, tags: setDeckZone(entry.tags, zone) };
			const updates = entryDbPatch(copy.entry, entry);
			if (isEmptyDbPatch(updates)) continue;
			decksCards[deckId] = { ...decksCards[deckId], [rowId]: { ...copy, entry } };
			rows.push({ rowId, updates });
		}
		if (rows.length === 0) return;
		set({ decksCards });
		enqueue({ type: 'bulk-update', payload: { rows } });
		triggerSync();
	},
```

- [ ] **Step 2: Context binding** — in `DeckContext.tsx`:

```ts
	bulkUpdateDeckCards: (rowIds: string[], edit: BulkEdit, zone?: DeckZone) => void;
```

```ts
const bulkUpdateDeckCards = useCallback(
	(rowIds: string[], edit: BulkEdit, zone?: DeckZone) =>
		store.bulkUpdateDeckCards(rowIds, edit, zone, triggerSync),
	[store, triggerSync]
);
```

Add `bulkUpdateDeckCards` to the context value object, and `import type { BulkEdit } from '@/lib/card/bulk/bulk-edit';` (follow the file's existing `useCallback` shape exactly — look at `updateDeckCard` ~line 230).

- [ ] **Step 3: `DeckBulkEditModal` becomes a wrapper**

```tsx
// src/app/[locale]/decks/[id]/components/DeckBulkEditModal/DeckBulkEditModal.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DeckZone } from '@/types/decks';
import { ZONE_LABELS } from '@/lib/deck/utils/zonesForFormat';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import type { BulkEdit, BulkField } from '@/lib/card/bulk/bulk-edit';
import styles from '@/lib/card/bulk/BulkEditModal.module.css';

const DECK_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
	'proxy',
	'forTrade',
	'alter',
];

export type DeckBulkEdit = {
	edit: BulkEdit;
	/** Target zone applied as the deck zone tag, if chosen. */
	zone?: DeckZone;
};

type Props = {
	cardCount: number;
	/** Zones offered as move targets (commander only when the deck supports it). */
	zones: DeckZone[];
	onApply: (edit: DeckBulkEdit) => void;
	onClose: () => void;
};

/** Deck flavour of the shared bulk-edit modal: adds the zone picker. */
export function DeckBulkEditModal({ cardCount, zones, onApply, onClose }: Props) {
	const t = useTranslations('decks');
	const tBulk = useTranslations('bulk');
	const [zone, setZone] = useState<DeckZone | ''>('');

	return (
		<BulkEditModal
			title={t('editNCards', { count: cardCount })}
			fields={DECK_FIELDS}
			extraHasChanges={zone !== ''}
			extraFields={
				<div className={styles.field}>
					<label className={styles.label} htmlFor="bulk-edit-zone">
						{tBulk('zone')}
					</label>
					<select
						id="bulk-edit-zone"
						className={styles.select}
						value={zone}
						onChange={(e) => setZone(e.target.value as DeckZone | '')}
					>
						<option value="">{tBulk('leaveUnchanged')}</option>
						{zones.map((z) => (
							<option key={z} value={z}>
								{ZONE_LABELS[z]}
							</option>
						))}
					</select>
				</div>
			}
			onApply={(edit) => onApply({ edit, zone: zone || undefined })}
			onClose={onClose}
		/>
	);
}
```

Check `ZONE_LABELS` in `src/lib/deck/utils/zonesForFormat.ts` has the same labels as the old local constant (`Mainboard`, `Sideboard`, …); `AddToDeckModal` already imports it from there.

- [ ] **Step 4: `DeckDetailOwnerView.tsx`**

1. Replace `import { useDeckBulkSelection } from './useDeckBulkSelection'` with:

```ts
import { useBulkSelection } from '@/lib/card/bulk/useBulkSelection';
import { rowIdsOfSelected } from '@/lib/card/bulk/selection';
import { BulkActionBar } from '@/lib/card/bulk/BulkActionBar';
import { BulkSelectOverlay } from '@/lib/card/bulk/BulkSelectOverlay';
```

and remove the `DeckBulkActionBar` import.

2. Create the hook **after** `deckStackBy` is declared (~line 146): `const bulk = useBulkSelection(JSON.stringify(deckStackBy));` and delete the old `useDeckBulkSelection()` call. This is the render-time reset that fixes the sub-project 1 deferred minor.

3. Replace every `bulk.selectedRowIds(stackBySelectionKey)` with `rowIdsOfSelected(bulk.selected, stackBySelectionKey, deckCopiesOf)` and every `bulk.selectedRowIds(stackBySelectionKey, pred)` with `rowIdsOfSelected(bulk.selected, stackBySelectionKey, deckCopiesOf, pred)`, with a module-level helper:

```ts
const deckCopiesOf = (stack: DeckStack) => stack.copies;
```

(`grep -n "selectedRowIds" "src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx"` must return nothing afterwards; `DeckStack` is already imported from `./useDeckCardSections` or import it.)

4. `handleBulkEditApply` becomes:

```ts
const handleBulkEditApply = useCallback(
	({ edit, zone }: DeckBulkEdit) => {
		bulkUpdateDeckCards(
			rowIdsOfSelected(bulk.selected, stackBySelectionKey, deckCopiesOf),
			edit,
			zone
		);
		setBulkEditModalOpen(false);
		bulk.exit();
	},
	[bulk, stackBySelectionKey, bulkUpdateDeckCards]
);
```

and take `bulkUpdateDeckCards` from `useDeckContext()` where `changeZone`/`updateDeckCard` are destructured (~line 74). Keep `changeZone`/`updateDeckCard` if they are still used elsewhere in the file.

5. The overlay block in `renderOverlay` (`if (bulk.selectMode) { … }`, ~lines 474-500) becomes:

```tsx
if (bulk.selectMode) {
	const checked = bulk.selected.has(selectionKeyOf(card) ?? '');
	return withCustomBadge(card, <BulkSelectOverlay checked={checked} />);
}
```

6. Replace the `<DeckBulkActionBar …/>` element (~line 701) with:

```tsx
{
	bulk.selectMode && (
		<BulkActionBar
			summary={t('selectedCount', { count: bulk.selected.size })}
			allSelected={allSelected}
			onToggleSelectAll={() => bulk.toggleSelectAll(allStackKeys)}
			hasSelection={bulk.selected.size > 0}
			actions={[
				{ id: 'edit', label: t('edit'), onClick: () => setBulkEditModalOpen(true) },
				{
					id: 'collection',
					label: t('addToCollection'),
					onClick: handleBulkAddToCollectionSelection,
				},
				{
					id: 'wishlist',
					label: (
						<>
							<WishlistIcon size={13} /> {t('wishlist')}
						</>
					),
					onClick: handleBulkAddToWishlist,
				},
				{ id: 'remove', label: t('remove'), onClick: handleBulkRemoveRequest, danger: true },
			]}
			onClear={bulk.clear}
			onExit={bulk.exit}
			escapeDisabled={bulkEditModalOpen || bulkRemove !== null}
		/>
	);
}
```

`t` in this file is `useTranslations('decks')` (check; adapt the variable name if different). Import `WishlistIcon` from `@/lib/wishlist/components/WishlistIcon` if it is not already imported.

7. Delete the now-unused files:

```bash
git rm "src/app/[locale]/decks/[id]/components/DeckBulkActionBar/DeckBulkActionBar.tsx" "src/app/[locale]/decks/[id]/useDeckBulkSelection.ts" "src/app/[locale]/decks/[id]/deck-bulk-selection.test.ts"
```

`SectionSelectButton.tsx` stays in `components/DeckBulkActionBar/` (still used); check with `grep -rn "DeckBulkActionBar/" src` that only `SectionSelectButton` imports remain.

- [ ] **Step 5: Tests, types, lint**

Run:

```bash
npx tsx --test src/lib/card/bulk/bulk-edit.test.ts src/lib/card/bulk/selection.test.ts src/lib/card/db/entry-db-patch.test.ts src/lib/supabase/group-row-updates.test.ts
npx tsx "src/app/[locale]/decks/[id]/deck-card-sections.test.ts"
npx tsc --noEmit -p . 2>&1 | grep -E "bulk|decks/\[id\]|deck-store|DeckContext"
npx eslint src/lib/card/bulk "src/app/[locale]/decks/[id]" src/lib/deck
```

Expected: all tests PASS, no tsc lines, eslint clean on these paths (compare with `git stash`-free baseline: only problems that already existed in these files are acceptable — list them in the commit body if any).

- [ ] **Step 6: Browser check of the deck (regression)**

`npm run dev`, open `http://localhost:3000/<locale>/decks/<id>` as the owner:

- "Select" → click 2 tiles → bar shows "2 selected" → Edit → condition NM + remove a user tag + zone Sideboard → Apply: copies move to sideboard, condition NM, user tag gone, zone tag intact (reload confirms).
- Network: one `PATCH …card_entries?id=in.(…)` per distinct patch, not one per copy.
- Change the stacking menu while 2 tiles are selected → counter returns to 0.
- Open the edit modal and press Escape → modal closes, select mode stays.

- [ ] **Step 7: Commit (Tasks 5 + 6 together)**

```bash
git add -A src/lib/card/bulk "src/app/[locale]/decks/[id]" src/lib/deck messages/en.json messages/fr.json
git commit -m "feat(bulk): shared bulk bar/modal/overlay; deck moved onto them, one bulk-update op

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Collection bulk actions (plans + store wiring)

**Files:**

- Create: `src/lib/collection/bulk-plans.ts`
- Test: `src/lib/collection/bulk-plans.test.ts`
- Create: `src/lib/collection/bulk-actions.ts`
- Modify: `src/lib/collection/context/CollectionContext.tsx`

**Interfaces:**

- Consumes: Tasks 1-3; `useCollectionStore`; `useDeckStore`, `patchLoadedDeckCard` (`@/lib/deck/store/deck-store`); `enqueue`; `setDeckZone`, `DeckZone`.
- Produces:
  - `type StoredCopy = { scryfallId: string; entry: CardEntry }` (local alias)
  - `planCollectionRemove(copies: Array<{ rowId: string; entry: CardEntry }>): { deleteIds: string[]; detachIds: string[] }`
  - `type AssignKind = 'free' | 'moved' | 'same'`
  - `planAssignToDeck(copies: Array<{ rowId: string; entry: CardEntry }>, deckId: string, zone: DeckZone): Array<{ rowId: string; kind: AssignKind; fromDeckId?: string; entry: CardEntry }>`
  - `summarizeAssign(plan): { total: number; same: number; movedByDeck: Map<string, number> }`
  - bulk-actions: `collectionBulkUpdate(rowIds, edit, userId, triggerSync)`, `collectionBulkRemove(rowIds, userId, triggerSync)`, `collectionBulkAssignToDeck(rowIds, deckId, zone, userId, triggerSync)`
  - context: `bulkUpdate(rowIds: string[], edit: BulkEdit)`, `bulkRemove(rowIds: string[])`, `bulkAssignToDeck(rowIds: string[], deckId: string, zone: DeckZone)`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/collection/bulk-plans.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { planAssignToDeck, planCollectionRemove, summarizeAssign } from './bulk-plans';

const copy = (rowId: string, over: Partial<CardEntry> = {}) => ({
	rowId,
	entry: { rowId, dateAdded: 'd', ...over } as CardEntry,
});

test('remove: free copies are deleted, deck-linked copies detached', () => {
	assert.deepEqual(planCollectionRemove([copy('a'), copy('b', { deckId: 'D' }), copy('c')]), {
		deleteIds: ['a', 'c'],
		detachIds: ['b'],
	});
});

test('assign: free / moved from another deck / already in target', () => {
	const plan = planAssignToDeck(
		[
			copy('a', { tags: ['x'] }),
			copy('b', { deckId: 'A', tags: ['deck:mainboard'] }),
			copy('c', { deckId: 'T', tags: ['deck:mainboard'] }),
		],
		'T',
		'sideboard'
	);
	assert.deepEqual(
		plan.map((p) => [p.rowId, p.kind, p.fromDeckId]),
		[
			['a', 'free', undefined],
			['b', 'moved', 'A'],
			['c', 'same', undefined],
		]
	);
	assert.deepEqual(plan[0].entry.tags, ['x', 'deck:sideboard']);
	assert.equal(plan[1].entry.deckId, 'T');
	assert.deepEqual(plan[2].entry.tags, ['deck:sideboard']);
});

test('summary counts same and moved per source deck', () => {
	const plan = planAssignToDeck(
		[copy('a', { deckId: 'A' }), copy('b', { deckId: 'A' }), copy('c', { deckId: 'T' }), copy('d')],
		'T',
		'mainboard'
	);
	const s = summarizeAssign(plan);
	assert.equal(s.total, 4);
	assert.equal(s.same, 1);
	assert.deepEqual([...s.movedByDeck], [['A', 2]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/collection/bulk-plans.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `bulk-plans.ts`**

```ts
// src/lib/collection/bulk-plans.ts
import type { CardEntry } from '@/types/cards';
import { setDeckZone, type DeckZone } from '@/types/decks';

type PlanCopy = { rowId: string; entry: CardEntry };

/**
 * A copy assigned to a deck is the deck card itself (one row): deleting it would
 * cascade it out of the deck, so it is detached (owner_id → null) instead, as
 * `clearCollection` does. Free copies are deleted.
 */
export function planCollectionRemove(copies: PlanCopy[]): {
	deleteIds: string[];
	detachIds: string[];
} {
	const deleteIds: string[] = [];
	const detachIds: string[] = [];
	for (const { rowId, entry } of copies) {
		if (entry.deckId) detachIds.push(rowId);
		else deleteIds.push(rowId);
	}
	return { deleteIds, detachIds };
}

export type AssignKind = 'free' | 'moved' | 'same';

/** New entry of each copy once attached to `deckId` in `zone`, and where it came from. */
export function planAssignToDeck(
	copies: PlanCopy[],
	deckId: string,
	zone: DeckZone
): Array<{ rowId: string; kind: AssignKind; fromDeckId?: string; entry: CardEntry }> {
	return copies.map(({ rowId, entry }) => {
		let kind: AssignKind = 'free';
		if (entry.deckId === deckId) kind = 'same';
		else if (entry.deckId) kind = 'moved';
		return {
			rowId,
			kind,
			fromDeckId: kind === 'moved' ? entry.deckId : undefined,
			entry: { ...entry, deckId, tags: setDeckZone(entry.tags, zone) },
		};
	});
}

export function summarizeAssign(plan: ReturnType<typeof planAssignToDeck>) {
	const movedByDeck = new Map<string, number>();
	let same = 0;
	for (const p of plan) {
		if (p.kind === 'same') same += 1;
		if (p.kind === 'moved' && p.fromDeckId) {
			movedByDeck.set(p.fromDeckId, (movedByDeck.get(p.fromDeckId) ?? 0) + 1);
		}
	}
	return { total: plan.length, same, movedByDeck };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/collection/bulk-plans.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `bulk-actions.ts`**

Kept outside `collection-store.ts` because it also touches the deck store, and `deck-store.ts` already imports `collection-store.ts` (avoid the import cycle).

```ts
// src/lib/collection/bulk-actions.ts
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { useDeckStore, patchLoadedDeckCard } from '@/lib/deck/store/deck-store';
import { applyBulkEdit, type BulkEdit } from '@/lib/card/bulk/bulk-edit';
import { entryDbPatch, isEmptyDbPatch } from '@/lib/card/db/entry-db-patch';
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
import { enqueue } from '@/lib/supabase/sync-queue';
import { planAssignToDeck, planCollectionRemove } from './bulk-plans';

type StoredCopy = { scryfallId: string; entry: CardEntry };

/** Bulk field edit; deck-linked copies are mirrored in their loaded deck. */
export function collectionBulkUpdate(
	rowIds: string[],
	edit: BulkEdit,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
	const next = { ...current };
	const rows: BulkUpdateRow[] = [];
	for (const rowId of rowIds) {
		const copy = current[rowId];
		if (!copy) continue;
		const entry = applyBulkEdit(copy.entry, edit);
		const updates = entryDbPatch(copy.entry, entry);
		if (isEmptyDbPatch(updates)) continue;
		next[rowId] = { ...copy, entry };
		rows.push({ rowId, updates });
		if (copy.entry.deckId) {
			patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: applyBulkEdit(c.entry, edit) }));
		}
	}
	if (rows.length === 0) return;
	useCollectionStore.setState({ entries: next });
	if (userId) {
		enqueue({ type: 'bulk-update', payload: { rows } });
		triggerSync();
	}
}

/** Free copies deleted; deck-linked copies detached (stay in their deck, unowned). */
export function collectionBulkRemove(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	const { deleteIds, detachIds } = planCollectionRemove(copies);
	if (deleteIds.length + detachIds.length === 0) return;

	const next = { ...current };
	for (const { rowId } of copies) delete next[rowId];
	useCollectionStore.setState({ entries: next });
	for (const rowId of detachIds) {
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, ownerId: undefined } }));
	}

	if (!userId) return;
	if (deleteIds.length > 0)
		enqueue({ type: 'bulk-delete', payload: { userId, rowIds: deleteIds } });
	if (detachIds.length > 0) {
		enqueue({
			type: 'bulk-update',
			payload: { rows: detachIds.map((rowId) => ({ rowId, updates: { owner_id: null } })) },
		});
	}
	triggerSync();
}

/**
 * Attach the copies themselves to `deckId` (deck_id + zone tag on the row). A
 * copy already in another deck leaves it. Loaded decks are patched in memory;
 * an unloaded deck re-reads the DB when it opens (`hydrateActiveDeck`).
 */
export function collectionBulkAssignToDeck(
	rowIds: string[],
	deckId: string,
	zone: DeckZone,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useCollectionStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	const plan = planAssignToDeck(copies, deckId, zone);
	if (plan.length === 0) return;

	const nextCollection = { ...current };
	const rows: BulkUpdateRow[] = [];
	const deckState = useDeckStore.getState();
	const decksCards: Record<string, Record<string, StoredCopy>> = { ...deckState.decksCards };
	const targetLoaded = decksCards[deckId] !== undefined;
	if (targetLoaded) decksCards[deckId] = { ...decksCards[deckId] };

	for (const p of plan) {
		const before = current[p.rowId];
		const updates = entryDbPatch(before.entry, p.entry);
		nextCollection[p.rowId] = { ...before, entry: p.entry };
		if (!isEmptyDbPatch(updates)) rows.push({ rowId: p.rowId, updates });

		if (p.fromDeckId && decksCards[p.fromDeckId]) {
			const source = { ...decksCards[p.fromDeckId] };
			delete source[p.rowId];
			decksCards[p.fromDeckId] = source;
		}
		if (targetLoaded) {
			decksCards[deckId][p.rowId] = {
				scryfallId: before.scryfallId,
				entry: { ...p.entry, ownerId: userId ?? undefined },
			};
		}
	}

	useCollectionStore.setState({ entries: nextCollection });
	const deck = deckState.decks[deckId];
	useDeckStore.setState({
		decksCards,
		...(deck
			? {
					decks: { ...deckState.decks, [deckId]: { ...deck, updatedAt: new Date().toISOString() } },
				}
			: {}),
	});

	if (userId && rows.length > 0) {
		enqueue({ type: 'bulk-update', payload: { rows } });
		triggerSync();
	}
}
```

- [ ] **Step 6: Bind in `CollectionContext.tsx`**

Type additions (in `CollectionContextValue`):

```ts
	bulkUpdate: (rowIds: string[], edit: BulkEdit) => void;
	bulkRemove: (rowIds: string[]) => void;
	bulkAssignToDeck: (rowIds: string[], deckId: string, zone: DeckZone) => void;
```

Bindings (next to the other `useCallback`s, ~line 115):

```ts
const bulkUpdate = useCallback(
	(rowIds: string[], edit: BulkEdit) => collectionBulkUpdate(rowIds, edit, userId, triggerSync),
	[userId, triggerSync]
);
const bulkRemove = useCallback(
	(rowIds: string[]) => collectionBulkRemove(rowIds, userId, triggerSync),
	[userId, triggerSync]
);
const bulkAssignToDeck = useCallback(
	(rowIds: string[], deckId: string, zone: DeckZone) =>
		collectionBulkAssignToDeck(rowIds, deckId, zone, userId, triggerSync),
	[userId, triggerSync]
);
```

Add the three to `value`, plus imports:

```ts
import type { DeckZone } from '@/types/decks';
import type { BulkEdit } from '@/lib/card/bulk/bulk-edit';
import {
	collectionBulkAssignToDeck,
	collectionBulkRemove,
	collectionBulkUpdate,
} from '@/lib/collection/bulk-actions';
```

- [ ] **Step 7: Types + lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "collection/(bulk|context)"; npx eslint src/lib/collection`
Expected: nothing from tsc; eslint clean on new files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/collection/bulk-plans.ts src/lib/collection/bulk-plans.test.ts src/lib/collection/bulk-actions.ts src/lib/collection/context/CollectionContext.tsx
git commit -m "feat(bulk): collection bulk edit / remove (detach deck copies) / assign to deck

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wishlist bulk actions

**Files:**

- Create: `src/lib/wishlist/bulk-plans.ts`
- Test: `src/lib/wishlist/bulk-plans.test.ts`
- Create: `src/lib/wishlist/bulk-actions.ts`
- Modify: `src/lib/wishlist/context/WishlistContext.tsx`

**Interfaces:**

- Consumes: Tasks 1-3; `useWishlistStore`, `useCollectionStore`, `getLoadedDeckCard`, `patchLoadedDeckCard`.
- Produces:
  - `planWishlistRemove(copies: Array<{ rowId: string; entry: CardEntry }>, isLoadedDeckCard: (rowId: string) => boolean): { deleteIds: string[]; unflagIds: string[] }`
  - bulk-actions: `wishlistBulkUpdate(rowIds, edit, userId, triggerSync)`, `wishlistBulkRemove(rowIds, userId, triggerSync)`, `wishlistBulkMoveToCollection(rowIds, userId, triggerSync)`
  - context: `bulkUpdate(rowIds: string[], edit: BulkEdit)`, `bulkRemove(rowIds: string[])`, `bulkMoveToCollection(rowIds: string[])`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/wishlist/bulk-plans.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CardEntry } from '@/types/cards';
import { planWishlistRemove } from './bulk-plans';

const copy = (rowId: string, over: Partial<CardEntry> = {}) => ({
	rowId,
	entry: { rowId, dateAdded: 'd', wishlist: true, ...over } as CardEntry,
});

test('deck cards (deckId or loaded in a deck) only lose the flag; others are deleted', () => {
	assert.deepEqual(
		planWishlistRemove([copy('a'), copy('b', { deckId: 'D' }), copy('c')], (id) => id === 'c'),
		{ deleteIds: ['a'], unflagIds: ['b', 'c'] }
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/wishlist/bulk-plans.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `bulk-plans.ts`**

```ts
// src/lib/wishlist/bulk-plans.ts
import type { CardEntry } from '@/types/cards';

/**
 * Same rule as `removeFromWishlist`: a wishlist row that is also a deck card
 * keeps living in its deck and only loses its wishlist flag. Pure wishlist rows
 * are deleted.
 */
export function planWishlistRemove(
	copies: Array<{ rowId: string; entry: CardEntry }>,
	isLoadedDeckCard: (rowId: string) => boolean
): { deleteIds: string[]; unflagIds: string[] } {
	const deleteIds: string[] = [];
	const unflagIds: string[] = [];
	for (const { rowId, entry } of copies) {
		if (entry.deckId != null || isLoadedDeckCard(rowId)) unflagIds.push(rowId);
		else deleteIds.push(rowId);
	}
	return { deleteIds, unflagIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/wishlist/bulk-plans.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `bulk-actions.ts`**

```ts
// src/lib/wishlist/bulk-actions.ts
import { useWishlistStore } from '@/lib/wishlist/store/wishlist-store';
import { useCollectionStore } from '@/lib/collection/store/collection-store';
import { getLoadedDeckCard, patchLoadedDeckCard } from '@/lib/deck/store/deck-store';
import { applyBulkEdit, type BulkEdit } from '@/lib/card/bulk/bulk-edit';
import { entryDbPatch, isEmptyDbPatch } from '@/lib/card/db/entry-db-patch';
import type { BulkUpdateRow } from '@/lib/supabase/group-row-updates';
import { enqueue } from '@/lib/supabase/sync-queue';
import { planWishlistRemove } from './bulk-plans';

const isLoadedDeckCard = (rowId: string) => getLoadedDeckCard(rowId) != null;

/** Bulk field edit; wishlisted deck cards are mirrored in their loaded deck. */
export function wishlistBulkUpdate(
	rowIds: string[],
	edit: BulkEdit,
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useWishlistStore.getState().entries;
	const next = { ...current };
	const rows: BulkUpdateRow[] = [];
	for (const rowId of rowIds) {
		const copy = current[rowId];
		if (!copy) continue;
		const entry = applyBulkEdit(copy.entry, edit);
		const updates = entryDbPatch(copy.entry, entry);
		if (isEmptyDbPatch(updates)) continue;
		next[rowId] = { ...copy, entry };
		rows.push({ rowId, updates });
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: applyBulkEdit(c.entry, edit) }));
	}
	if (rows.length === 0) return;
	useWishlistStore.setState({ entries: next });
	if (userId) {
		enqueue({ type: 'bulk-update', payload: { rows } });
		triggerSync();
	}
}

export function wishlistBulkRemove(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const current = useWishlistStore.getState().entries;
	const copies = rowIds.flatMap((rowId) =>
		current[rowId] ? [{ rowId, entry: current[rowId].entry }] : []
	);
	if (copies.length === 0) return;
	const { deleteIds, unflagIds } = planWishlistRemove(copies, isLoadedDeckCard);

	const next = { ...current };
	for (const { rowId } of copies) delete next[rowId];
	useWishlistStore.setState({ entries: next });
	for (const rowId of unflagIds) {
		patchLoadedDeckCard(rowId, (c) => ({ ...c, entry: { ...c.entry, wishlist: undefined } }));
	}

	if (!userId) return;
	if (deleteIds.length > 0)
		enqueue({ type: 'bulk-delete', payload: { userId, rowIds: deleteIds } });
	if (unflagIds.length > 0) {
		enqueue({
			type: 'bulk-update',
			payload: { rows: unflagIds.map((rowId) => ({ rowId, updates: { wishlist: false } })) },
		});
	}
	triggerSync();
}

/**
 * Flip in place (same rowId): wishlist=false, owner_id=userId. Printing and
 * metadata are kept. owner_id is required for deck cards (NULL owner) and a
 * no-op for pure wishlist rows (already owned by the user).
 */
export function wishlistBulkMoveToCollection(
	rowIds: string[],
	userId: string | null,
	triggerSync: () => void
): void {
	const wishlistEntries = useWishlistStore.getState().entries;
	const colEntries = useCollectionStore.getState().entries;
	const nextWishlist = { ...wishlistEntries };
	const nextCollection = { ...colEntries };
	const moved: string[] = [];
	for (const rowId of rowIds) {
		const copy = wishlistEntries[rowId];
		if (!copy) continue;
		delete nextWishlist[rowId];
		nextCollection[rowId] = {
			scryfallId: copy.scryfallId,
			entry: { ...copy.entry, rowId, wishlist: false },
		};
		patchLoadedDeckCard(rowId, (c) => ({
			...c,
			entry: { ...c.entry, wishlist: undefined, ownerId: userId ?? undefined },
		}));
		moved.push(rowId);
	}
	if (moved.length === 0) return;
	useWishlistStore.setState({ entries: nextWishlist });
	useCollectionStore.setState({ entries: nextCollection });
	if (userId) {
		enqueue({
			type: 'bulk-update',
			payload: {
				rows: moved.map((rowId) => ({ rowId, updates: { wishlist: false, owner_id: userId } })),
			},
		});
		triggerSync();
	}
}
```

Check the shape of `useWishlistStore.getState().entries` (`WishlistData`): it must be `Record<rowId, { scryfallId; entry }>` like the collection store (`WishlistContext.moveToCollection` reads it that way). If the store keeps a different shape, adapt the reads, not the store.

- [ ] **Step 6: Bind in `WishlistContext.tsx`**

Type additions:

```ts
	bulkUpdate: (rowIds: string[], edit: BulkEdit) => void;
	bulkRemove: (rowIds: string[]) => void;
	bulkMoveToCollection: (rowIds: string[]) => void;
```

Bindings:

```ts
const bulkUpdate = useCallback(
	(rowIds: string[], edit: BulkEdit) => wishlistBulkUpdate(rowIds, edit, userId, triggerSync),
	[userId, triggerSync]
);
const bulkRemove = useCallback(
	(rowIds: string[]) => wishlistBulkRemove(rowIds, userId, triggerSync),
	[userId, triggerSync]
);
const bulkMoveToCollection = useCallback(
	(rowIds: string[]) => wishlistBulkMoveToCollection(rowIds, userId, triggerSync),
	[userId, triggerSync]
);
```

Add them to the context value, plus imports (`BulkEdit`, the three functions).

- [ ] **Step 7: Types + lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "wishlist/(bulk|context)"; npx eslint src/lib/wishlist`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/wishlist/bulk-plans.ts src/lib/wishlist/bulk-plans.test.ts src/lib/wishlist/bulk-actions.ts src/lib/wishlist/context/WishlistContext.tsx
git commit -m "feat(bulk): wishlist bulk edit / remove / move to collection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Collection page — selection mode, modals, add-to-deck

**Files:**

- Modify: `src/lib/collection-index/hooks/useIndexedCollection.ts` (return value)
- Modify: `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx`
- Create: `src/app/[locale]/collection/lib/BulkAddToDeckModal/BulkAddToDeckModal.tsx`
- Modify: `src/app/[locale]/collection/page.tsx`

**Interfaces:**

- Consumes: Task 4 (`useStackSelection`), Task 5 (components), Task 7 (`bulkUpdate`, `bulkRemove`, `bulkAssignToDeck`, `planAssignToDeck`, `summarizeAssign`).
- Produces:
  - `useIndexedCollection(...)` also returns `allStacks: FacetStack[]`.
  - `CollectionView` prop `selection?: { active: boolean; isSelected: (stackKey: string) => boolean; toggle: (stackKey: string) => void }`.
  - `BulkAddToDeckModal(props: { copies: Array<{ rowId: string; entry: CardEntry }>; onConfirm(deckId: string, zone: DeckZone): void; onClose(): void })`.

- [ ] **Step 1: Expose `allStacks`** — in `useIndexedCollection.ts`, add to the returned object:

```ts
		/** Every filtered stack (all pages), for "select all" and bulk resolution. */
		allStacks: facetStacks,
```

- [ ] **Step 2: `CollectionView` selection prop**

Add to `Props`:

```ts
	/**
	 * Bulk selection mode (owner only). While `active`, a tile click toggles its
	 * stack (keyed by `stack.key`), the context menu is off and tiles show a
	 * check overlay.
	 */
	selection?: {
		active: boolean;
		isSelected: (stackKey: string) => boolean;
		toggle: (stackKey: string) => void;
	};
```

Destructure `selection` and change the `CardList` props:

```tsx
					onCardClick={
						selection?.active
							? (card: AnyCard) => {
									const stack = stackByRowId.get(cardKey(card));
									if (stack) selection.toggle(stack.key);
								}
							: onCardClick
								? (card: AnyCard) => {
										const stack = stackByRowId.get(cardKey(card));
										if (stack) onCardClick(stack);
									}
								: undefined
					}
					buildCardMenuItems={
						buildCardMenuItems && !selection?.active
							? (card: AnyCard, close: () => void) => {
									const stack = stackByRowId.get(cardKey(card));
									return stack ? buildCardMenuItems(stack, close) : null;
								}
							: undefined
					}
```

and in `renderOverlay`, before building the badges:

```tsx
if (selection?.active && stack) {
	return withCustomBadge(
		card,
		<>
			<BulkSelectOverlay checked={selection.isSelected(stack.key)} />
			{countBadge}
		</>
	);
}
```

(`countBadge` must be computed before this `if`; move its declaration up.) Import `BulkSelectOverlay` from `@/lib/card/bulk/BulkSelectOverlay`.

- [ ] **Step 3: `BulkAddToDeckModal.tsx`**

```tsx
// src/app/[locale]/collection/lib/BulkAddToDeckModal/BulkAddToDeckModal.tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Modal } from '@/components/Modal/Modal';
import type { CardEntry } from '@/types/cards';
import type { DeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { zonesForFormat, ZONE_LABELS } from '@/lib/deck/utils/zonesForFormat';
import { planAssignToDeck, summarizeAssign } from '@/lib/collection/bulk-plans';
import styles from '@/lib/card/bulk/BulkEditModal.module.css';

type Props = {
	copies: Array<{ rowId: string; entry: CardEntry }>;
	onConfirm: (deckId: string, zone: DeckZone) => void;
	onClose: () => void;
};

/** Pick a deck + zone for the selected collection copies; states what will move. */
export function BulkAddToDeckModal({ copies, onConfirm, onClose }: Props) {
	const t = useTranslations('bulk');
	const { decks } = useDeckContext();
	const sortedDecks = useMemo(
		() => [...decks].sort((a, b) => a.name.localeCompare(b.name)),
		[decks]
	);
	const [deckId, setDeckId] = useState(sortedDecks[0]?.id ?? '');
	const selectedDeck = sortedDecks.find((d) => d.id === deckId) ?? null;
	const zones = useMemo(() => zonesForFormat(selectedDeck?.format), [selectedDeck?.format]);
	const [zone, setZone] = useState<DeckZone>('mainboard');
	const effectiveZone = zones.includes(zone) ? zone : zones[0];

	const summary = useMemo(
		() => summarizeAssign(planAssignToDeck(copies, deckId, effectiveZone)),
		[copies, deckId, effectiveZone]
	);
	const deckName = (id: string) => decks.find((d) => d.id === id)?.name ?? '?';

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<span className={styles.title}>{t('addToDeckTitle', { count: copies.length })}</span>
			</div>

			{sortedDecks.length === 0 ? (
				<div className={styles.body}>
					<p className={styles.hint}>{t('noDecks')}</p>
					<Link href="/decks">{t('goToDecks')}</Link>
				</div>
			) : (
				<div className={styles.body}>
					<div className={styles.grid}>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-deck">
								{t('deck')}
							</label>
							<select
								id="bulk-deck"
								className={styles.select}
								value={deckId}
								onChange={(e) => setDeckId(e.target.value)}
							>
								{sortedDecks.map((d) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="bulk-deck-zone">
								{t('zone')}
							</label>
							<select
								id="bulk-deck-zone"
								className={styles.select}
								value={effectiveZone}
								onChange={(e) => setZone(e.target.value as DeckZone)}
							>
								{zones.map((z) => (
									<option key={z} value={z}>
										{ZONE_LABELS[z]}
									</option>
								))}
							</select>
						</div>
					</div>
					{[...summary.movedByDeck].map(([fromId, count]) => (
						<p key={fromId} className={styles.hint}>
							{t('movedFromDeck', { count, deck: deckName(fromId) })}
						</p>
					))}
					{summary.same > 0 && (
						<p className={styles.hint}>{t('alreadyInDeck', { count: summary.same })}</p>
					)}
				</div>
			)}

			<div className={styles.footer}>
				<button type="button" className={styles.cancelBtn} onClick={onClose}>
					{t('cancel')}
				</button>
				<button
					type="button"
					className={styles.applyBtn}
					disabled={!deckId || copies.length === 0}
					onClick={() => {
						onConfirm(deckId, effectiveZone);
						onClose();
					}}
				>
					{t('confirm')}
				</button>
			</div>
		</Modal>
	);
}
```

Check that `useDeckContext().decks` is an array of `DeckMeta` with `id`, `name`, `format` (it is what `AddToDeckModal` uses). If `decks` contains precons (`source === 'mtgjson'`), filter them out with `.filter((d) => d.source !== 'mtgjson')` — `AddToDeckModal` does not; verify in the browser which decks it lists and match it.

- [ ] **Step 4: Wire `collection/page.tsx`**

Imports:

```ts
import { useStackSelection } from '@/lib/card/bulk/useStackSelection';
import { BulkActionBar } from '@/lib/card/bulk/BulkActionBar';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import { SelectModeButton } from '@/lib/card/bulk/SelectModeButton';
import type { BulkField } from '@/lib/card/bulk/bulk-edit';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { planCollectionRemove } from '@/lib/collection/bulk-plans';
import { BulkAddToDeckModal } from './lib/BulkAddToDeckModal/BulkAddToDeckModal';
```

Module constant:

```ts
const COLLECTION_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
	'proxy',
	'forTrade',
	'alter',
	'purchasePrice',
];
```

In `CollectionPageInner`, after `model`:

```ts
const tBulk = useTranslations('bulk');
const { collection, bulkUpdate, bulkRemove, bulkAssignToDeck } = useCollectionContext();
const selection = useStackSelection(
	model.allStacks,
	`${JSON.stringify(model.filters)}|${JSON.stringify(stackBy)}`
);
const [bulkModal, setBulkModal] = useState<'edit' | 'deck' | 'remove' | null>(null);
const selectedCopies = useMemo(
	() =>
		selection.selectedRowIds.flatMap((rowId) =>
			collection[rowId] ? [{ rowId, entry: collection[rowId].entry }] : []
		),
	[selection.selectedRowIds, collection]
);
const closeBulkModal = useCallback(() => setBulkModal(null), []);
```

(merge the destructuring with the existing `useCollectionContext()` call instead of calling it twice; add `useMemo` to the React import.)

`toolbarExtra` becomes:

```tsx
			toolbarExtra={
				<>
					<StackByMenu value={stackBy} onChange={setStackBy} />
					<SelectModeButton active={selection.selectMode} onToggle={selection.toggleMode} />
				</>
			}
```

Pass to `CollectionView`:

```tsx
			selection={{
				active: selection.selectMode,
				isSelected: (key) => selection.selected.has(key),
				toggle: selection.toggle,
			}}
```

Inside the `CollectionView` children (next to `<ImportModal />`):

```tsx
{
	selection.selectMode && (
		<BulkActionBar
			summary={tBulk('summary', {
				stacks: selection.stackCount,
				copies: selection.selectedRowIds.length,
			})}
			allSelected={selection.allSelected}
			selectAllDisabled={model.isInitialLoading}
			onToggleSelectAll={() => selection.toggleSelectAll(selection.allKeys)}
			hasSelection={selection.selectedRowIds.length > 0}
			actions={[
				{ id: 'edit', label: tBulk('edit'), onClick: () => setBulkModal('edit') },
				{ id: 'deck', label: tBulk('addToDeck'), onClick: () => setBulkModal('deck') },
				{
					id: 'remove',
					label: tBulk('remove'),
					onClick: () => setBulkModal('remove'),
					danger: true,
				},
			]}
			onClear={selection.clear}
			onExit={selection.exit}
			escapeDisabled={bulkModal !== null}
		/>
	);
}
{
	bulkModal === 'edit' && (
		<BulkEditModal
			title={tBulk('editTitle', { count: selectedCopies.length })}
			fields={COLLECTION_FIELDS}
			onApply={(edit) => {
				bulkUpdate(selection.selectedRowIds, edit);
				selection.clear();
			}}
			onClose={closeBulkModal}
		/>
	);
}
{
	bulkModal === 'deck' && (
		<BulkAddToDeckModal
			copies={selectedCopies}
			onConfirm={(deckId, zone) => {
				bulkAssignToDeck(selection.selectedRowIds, deckId, zone);
				selection.clear();
			}}
			onClose={closeBulkModal}
		/>
	);
}
{
	bulkModal === 'remove' && (
		<ConfirmModal
			message={tBulk('confirmRemoveCollection', { count: selectedCopies.length })}
			confirmLabel={tBulk('remove')}
			onConfirm={() => {
				bulkRemove(selection.selectedRowIds);
				selection.clear();
				setBulkModal(null);
			}}
			onClose={closeBulkModal}
		>
			{planCollectionRemove(selectedCopies).detachIds.length > 0 && (
				<p>
					{tBulk('detachNotice', {
						count: planCollectionRemove(selectedCopies).detachIds.length,
					})}
				</p>
			)}
		</ConfirmModal>
	);
}
```

(Compute `const detachCount = planCollectionRemove(selectedCopies).detachIds.length;` once above the JSX instead of calling it twice.) The hooks are declared before the early `if (!isLoaded) return` (rules of hooks).

- [ ] **Step 5: Types + lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "collection"; npx eslint "src/app/[locale]/collection" src/lib/collection-index`
Expected: clean (or only pre-existing problems in untouched lines).

- [ ] **Step 6: Browser check** (`http://localhost:3000/<locale>/collection`, signed in, ≥ 2 decks)

1. Stacking by name. "Sélectionner" → click 3 tiles → bar "3 cartes · N copies". Context menu does not open on right-click; card modal does not open on click.
2. Edit → condition NM + add tag `bulk-test` → Apply: copies updated; reload keeps them. Network: a few `PATCH card_entries?id=in.(…)`.
3. Filter by a set, "Tout sélectionner": counter copies = filtered stats total, even before scrolling.
4. Change the stacking or the filter: selection goes back to 0.
5. "Ajouter à un deck" with copies already in deck A → target B: the summary says "x copies déplacées depuis A"; after confirm they are in B (open B), not in A (open A), after a reload too.
6. Remove with deck-linked copies: the confirmation shows the detach notice; afterwards they are gone from the collection, still in their deck as unowned.
7. Escape with a modal open closes only the modal; Escape without a modal exits select mode.

- [ ] **Step 7: Commit**

```bash
git add src/lib/collection-index/hooks/useIndexedCollection.ts "src/app/[locale]/collection"
git commit -m "feat(collection): selection mode with bulk edit, add to deck, remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Wishlist page — selection mode

**Files:**

- Modify: `src/app/[locale]/wishlist/page.tsx`

**Interfaces:**

- Consumes: Task 4, Task 5, Task 8 (`bulkUpdate`, `bulkRemove`, `bulkMoveToCollection`), Task 9 (`model.allStacks`).

- [ ] **Step 1: Wire the page**

Imports:

```ts
import { useStackSelection } from '@/lib/card/bulk/useStackSelection';
import { BulkActionBar } from '@/lib/card/bulk/BulkActionBar';
import { BulkEditModal } from '@/lib/card/bulk/BulkEditModal';
import { BulkSelectOverlay } from '@/lib/card/bulk/BulkSelectOverlay';
import { SelectModeButton } from '@/lib/card/bulk/SelectModeButton';
import type { BulkField } from '@/lib/card/bulk/bulk-edit';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
```

```ts
const WISHLIST_FIELDS: readonly BulkField[] = [
	'tagsAdd',
	'tagsRemove',
	'condition',
	'language',
	'finish',
];
```

In `WishlistPageInner` (before the `if (!isLoaded)` early return):

```ts
const tBulk = useTranslations('bulk');
// extend the existing destructuring:
// const { entries, isLoaded, clearWishlist, moveToCollection, bulkUpdate, bulkRemove, bulkMoveToCollection } = useWishlistContext();
const selection = useStackSelection(model.allStacks, JSON.stringify(stackBy));
const [bulkModal, setBulkModal] = useState<'edit' | 'move' | 'remove' | null>(null);
const closeBulkModal = useCallback(() => setBulkModal(null), []);
const copyCount = selection.selectedRowIds.length;
```

`CardList` props:

```tsx
							toolbarExtra={
								<>
									<StackByMenu value={stackBy} onChange={setStackBy} />
									<SelectModeButton active={selection.selectMode} onToggle={selection.toggleMode} />
								</>
							}
							onCardClick={(card) => {
								const stack = stackByRowId.get(cardKey(card));
								if (!stack) return;
								if (selection.selectMode) selection.toggle(stack.key);
								else handleCardClick(stack);
							}}
							buildCardMenuItems={
								selection.selectMode
									? undefined
									: (card, close) => {
											/* existing body unchanged */
										}
							}
```

In `renderOverlay`, right after `countBadge` is computed:

```tsx
if (selection.selectMode && stack) {
	return withCustomBadge(
		card,
		<>
			<BulkSelectOverlay checked={selection.selected.has(stack.key)} />
			{countBadge}
		</>
	);
}
```

After `<ImportModal />`:

```tsx
{
	selection.selectMode && (
		<BulkActionBar
			summary={tBulk('summary', { stacks: selection.stackCount, copies: copyCount })}
			allSelected={selection.allSelected}
			selectAllDisabled={model.isInitialLoading}
			onToggleSelectAll={() => selection.toggleSelectAll(selection.allKeys)}
			hasSelection={copyCount > 0}
			actions={[
				{ id: 'edit', label: tBulk('edit'), onClick: () => setBulkModal('edit') },
				{ id: 'move', label: tBulk('moveToCollection'), onClick: () => setBulkModal('move') },
				{
					id: 'remove',
					label: tBulk('remove'),
					onClick: () => setBulkModal('remove'),
					danger: true,
				},
			]}
			onClear={selection.clear}
			onExit={selection.exit}
			escapeDisabled={bulkModal !== null}
		/>
	);
}
{
	bulkModal === 'edit' && (
		<BulkEditModal
			title={tBulk('editTitle', { count: copyCount })}
			fields={WISHLIST_FIELDS}
			onApply={(edit) => {
				bulkUpdate(selection.selectedRowIds, edit);
				selection.clear();
			}}
			onClose={closeBulkModal}
		/>
	);
}
{
	bulkModal === 'move' && (
		<ConfirmModal
			message={tBulk('confirmMoveToCollection', { count: copyCount })}
			confirmLabel={tBulk('confirm')}
			onConfirm={() => {
				bulkMoveToCollection(selection.selectedRowIds);
				selection.clear();
				setBulkModal(null);
			}}
			onClose={closeBulkModal}
		/>
	);
}
{
	bulkModal === 'remove' && (
		<ConfirmModal
			message={tBulk('confirmRemoveWishlist', { count: copyCount })}
			confirmLabel={tBulk('remove')}
			onConfirm={() => {
				bulkRemove(selection.selectedRowIds);
				selection.clear();
				setBulkModal(null);
			}}
			onClose={closeBulkModal}
		/>
	);
}
```

`ConfirmModal`'s confirm button is `variant="danger"`; for "move" that is acceptable (it is how `ConfirmModal` exists today) — do not add a variant prop.

- [ ] **Step 2: Types + lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "wishlist"; npx eslint "src/app/[locale]/wishlist"`
Expected: clean.

- [ ] **Step 3: Browser check** (`http://localhost:3000/<locale>/wishlist`)

1. Select 2 stacks, edit language French + remove tag → applied, reload keeps it.
2. Wishlist a card from a deck (deck card modal → wishlist), then on the wishlist select it + a pure wishlist card → "Déplacer vers la collection" → both appear in the collection, leave the wishlist; the deck card stays in its deck and shows as owned (reload the deck).
3. Remove a wishlisted deck card → it leaves the wishlist, still in the deck without the flag.
4. Change stacking → selection cleared.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/wishlist/page.tsx"
git commit -m "feat(wishlist): selection mode with bulk edit, move to collection, remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification and docs

**Files:**

- Modify: `docs/superpowers/specs/2026-10-18-bulk-edit-collection-wishlist-design.md` (status + implementation notes)
- Modify: `AGENTS.md` only if it documents the sync op list (`grep -n "bulk-delete" AGENTS.md`): add `bulk-update` next to it.

- [ ] **Step 1: All tests**

```bash
npx tsx --test src/lib/card/bulk/bulk-edit.test.ts src/lib/card/bulk/selection.test.ts src/lib/card/db/entry-db-patch.test.ts src/lib/supabase/group-row-updates.test.ts src/lib/collection/bulk-plans.test.ts src/lib/wishlist/bulk-plans.test.ts src/lib/card/utils/group-cards.test.ts src/lib/card/utils/stack-by.test.ts src/lib/card/utils/focus-copy.test.ts
npx tsx "src/app/[locale]/decks/[id]/deck-card-sections.test.ts"
```

Expected: all PASS.

- [ ] **Step 2: Static gate**

```bash
npx eslint $(git diff --name-only 134dc484..HEAD -- '*.ts' '*.tsx' | tr '\n' ' ')
npm run build
```

`134dc484` is the spec commit, before Task 1. Expected: eslint reports no problem introduced by these commits; `npm run build` succeeds.

- [ ] **Step 3: Sync queue sanity** — after the browser checks of Tasks 6/9/10, in the browser console: `JSON.parse(localStorage.getItem('wizcard-sync-queue') ?? '[]').length` → `0` (no stuck/failed op). In Studio (`npm run sb:studio`), spot-check 2-3 edited rows in `card_entries`.

- [ ] **Step 4: Spec status + notes**

Set the spec's `**Status**:` line to `Implemented <date>, on main (not pushed).` and add an `## Implementation notes` section listing deviations, at least:

- selection key = `stack.key` (not the representative `rowId`) and why;
- cross-store bulk actions live in `src/lib/{collection,wishlist}/bulk-actions.ts` (import cycle deck-store → collection-store);
- deck bulk edit still exits select mode after applying (unchanged behaviour); collection/wishlist keep the mode on;
- the deck store's bulk edit does not mirror into the collection/wishlist stores (same as the old `updateDeckCard`);
- wishlist → collection now also sets `ownerId` on the loaded deck copy.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-18-bulk-edit-collection-wishlist-design.md AGENTS.md
git commit -m "docs(bulk): implementation notes for bulk edit on collection and wishlist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
