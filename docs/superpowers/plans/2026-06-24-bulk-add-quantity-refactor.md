# Bulk-Add Quantity Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "call `onAdd` N times" loop with a single shared `buildEntriesBatch` unit + one bulk-insert per add, so adding N copies costs one DB INSERT instead of N.

**Architecture:** Extract a pure `buildEntriesBatch(scryfallId, count, patch)` (with the deduplicated `newEntry`) into `src/lib/card/entry/`. The `bulk-insert` sync op gains a `wishlist` flag so wishlist can use the same batch path. Collection store gets `addCards`; wishlist `addToWishlist` gains a `count` param; both delegate entry-building to `buildEntriesBatch` and enqueue exactly one `bulk-insert`. `EditCardModal`'s add `onAdd` becomes `(card, entry, count)` called once. The 5 add-to-collection/wishlist call-sites migrate to the batch path.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, Zustand stores, Supabase. Unit tests are plain `tsx` scripts using a hand-rolled `check()` helper (see `src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts`), run with `npx tsx <file>`.

## Global Constraints

- Run `npm run check` (tsc + ESLint + Prettier) before every commit; it must pass.
- UI copy is in French.
- A `count` parameter is always added LAST, with default `1`, so existing 2-arg calls stay valid.
- The quantity clamp (`Math.max(1, Math.floor(count) || 1)`) lives ONLY in `buildEntriesBatch` — not duplicated in stores or the modal.
- Each added copy is a separate entry with its own `rowId` (via `crypto.randomUUID()`).
- Adding N copies must enqueue exactly ONE `bulk-insert` op (not N ops, not N inserts).
- `bulk-insert` op shape: `{ type: 'bulk-insert'; payload: { userId: string; rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>; wishlist?: boolean } }`.
- `newEntry(rowId, overrides?)` body is exactly: `{ rowId, dateAdded: new Date().toISOString(), ...overrides }`.

---

### Task 1: Extract `buildEntriesBatch` + shared `newEntry`

**Files:**

- Create: `src/lib/card/entry/buildEntriesBatch.ts`
- Create: `src/lib/card/entry/buildEntriesBatch.test.ts`

**Interfaces:**

- Consumes: `CardEntry` from `@/types/cards`.
- Produces:

  ```ts
  export function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry;
  export function buildEntriesBatch(
  	scryfallId: string,
  	count: number,
  	entryPatch?: Partial<CardEntry>
  ): Array<{ rowId: string; scryfallId: string; entry: CardEntry }>;
  ```

  N distinct rowIds; `entryPatch` applied to each entry; `count` clamped so 0/negative/NaN → 1, and `2.7` → 2.

- [ ] **Step 1: Write the failing test**

Create `src/lib/card/entry/buildEntriesBatch.test.ts`:

```ts
import { buildEntriesBatch, newEntry } from './buildEntriesBatch';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

// newEntry shape
const e = newEntry('row-1', { condition: 'NM' });
check('newEntry sets rowId', e.rowId === 'row-1');
check('newEntry sets dateAdded', typeof e.dateAdded === 'string' && e.dateAdded.length > 0);
check('newEntry applies overrides', e.condition === 'NM');

// count = 3 → 3 distinct rows
const rows = buildEntriesBatch('sf-1', 3, { condition: 'LP' });
check('count 3 → 3 rows', rows.length === 3);
const ids = new Set(rows.map((r) => r.rowId));
check('3 distinct rowIds', ids.size === 3);
check(
	'scryfallId carried',
	rows.every((r) => r.scryfallId === 'sf-1')
);
check(
	'patch applied to each entry',
	rows.every((r) => r.entry.condition === 'LP')
);
check(
	'entry.rowId matches row.rowId',
	rows.every((r) => r.entry.rowId === r.rowId)
);

// clamp
check('count 0 → 1 row', buildEntriesBatch('x', 0).length === 1);
check('count -5 → 1 row', buildEntriesBatch('x', -5).length === 1);
check('count NaN → 1 row', buildEntriesBatch('x', Number.NaN).length === 1);
check('count 2.7 → 2 rows', buildEntriesBatch('x', 2.7).length === 2);
check('count 1 → 1 row', buildEntriesBatch('x', 1).length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/card/entry/buildEntriesBatch.test.ts`
Expected: FAIL — module `./buildEntriesBatch` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/card/entry/buildEntriesBatch.ts`:

```ts
import type { CardEntry } from '@/types/cards';

export function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}

/** Fabrique N entries distinctes (rowId unique chacune) pour une même carte. Pur. */
export function buildEntriesBatch(
	scryfallId: string,
	count: number,
	entryPatch?: Partial<CardEntry>
): Array<{ rowId: string; scryfallId: string; entry: CardEntry }> {
	const n = Math.max(1, Math.floor(count) || 1);
	const rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }> = [];
	for (let i = 0; i < n; i++) {
		const rowId = crypto.randomUUID();
		rows.push({ rowId, scryfallId, entry: newEntry(rowId, entryPatch) });
	}
	return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/card/entry/buildEntriesBatch.test.ts`
Expected: `14 passed, 0 failed`.

- [ ] **Step 5: Verify lint/types**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/entry/buildEntriesBatch.ts src/lib/card/entry/buildEntriesBatch.test.ts
git commit -m "feat(card): add pure buildEntriesBatch + shared newEntry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Thread `wishlist` flag through the bulk-insert sync op

**Files:**

- Modify: `src/lib/supabase/sync-queue.ts` (the `bulk-insert` op type, ~lines 34-43)
- Modify: `src/lib/supabase/hooks/useSyncQueue.ts` (the `bulk-insert` branch in `executeOp`, ~lines 48-49)
- Modify: `src/lib/collection/db/collection.ts` (`insertEntries`, ~lines 86-104)

**Interfaces:**

- Consumes: nothing from prior tasks.
- Produces: `insertEntries(userId, rows, wishlist = false)`; `bulk-insert` op payload now allows `wishlist?: boolean`.

- [ ] **Step 1: Add `wishlist?` to the bulk-insert op type**

In `src/lib/supabase/sync-queue.ts`, find the `bulk-insert` union member:

```ts
	| {
			id: string;
			type: 'bulk-insert';
			payload: {
				userId: string;
				rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>;
			};
			retries: number;
			createdAt: string;
	  }
```

Add `wishlist?: boolean;` to the payload:

```ts
	| {
			id: string;
			type: 'bulk-insert';
			payload: {
				userId: string;
				rows: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>;
				wishlist?: boolean;
			};
			retries: number;
			createdAt: string;
	  }
```

- [ ] **Step 2: Pass the flag in `executeOp`**

In `src/lib/supabase/hooks/useSyncQueue.ts`, find:

```ts
	} else if (op.type === 'bulk-insert') {
		await insertEntries(op.payload.userId, op.payload.rows);
```

Replace with:

```ts
	} else if (op.type === 'bulk-insert') {
		await insertEntries(op.payload.userId, op.payload.rows, op.payload.wishlist ?? false);
```

- [ ] **Step 3: Apply the flag in `insertEntries`**

In `src/lib/collection/db/collection.ts`, replace the whole `insertEntries` function:

```ts
export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		const { error } = await supabase.from('cards').insert(
			batch.map((r) => ({
				...cardEntryToRow(r.scryfallId, r.entry),
				owner_id: userId,
			}))
		);
		if (error) {
			throw new Error(`[collection] insertEntries error: ${error.message}`);
		}
	}
}
```

with (adds `wishlist` param + maps it onto each row):

```ts
export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>,
	wishlist = false
): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		const { error } = await supabase.from('cards').insert(
			batch.map((r) => ({
				...cardEntryToRow(r.scryfallId, r.entry),
				owner_id: userId,
				wishlist,
			}))
		);
		if (error) {
			throw new Error(`[collection] insertEntries error: ${error.message}`);
		}
	}
}
```

- [ ] **Step 4: Verify lint/types**

Run: `npm run check`
Expected: PASS. (`importCards` still calls `insertEntries(userId, rows)` — valid, `wishlist` defaults to `false`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/sync-queue.ts src/lib/supabase/hooks/useSyncQueue.ts src/lib/collection/db/collection.ts
git commit -m "feat(sync): thread wishlist flag through bulk-insert op

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Collection store `addCards` (+ dedupe `newEntry`)

**Files:**

- Modify: `src/lib/collection/store/collection-store.ts`
- Create: `src/lib/collection/store/add-cards.test.ts`

**Interfaces:**

- Consumes: `buildEntriesBatch`, `newEntry` from `@/lib/card/entry/buildEntriesBatch` (Task 1); `bulk-insert` op with `wishlist?` (Task 2).
- Produces: store action `addCards(card, count, userId, triggerSync, entryPatch?)`.

- [ ] **Step 1: Write the failing test**

This test drives `addCards` directly and asserts on store STATE, matching the existing store-test pattern (`src/lib/deck/store/unassign-collection-copy.test.ts`). It does NOT assert on enqueued ops: under `tsx`/node there is no `window`, so the sync-queue's `enqueue` no-ops silently and cannot be observed. The single-bulk-insert guarantee is covered by the `buildEntriesBatch` unit test (Task 1), code reading, and the manual Network check (Task 7). `synced` IS observable because `triggerSync` is the caller's own callback. Create `src/lib/collection/store/add-cards.test.ts`:

```ts
import { useCollectionStore } from './collection-store';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

const store = useCollectionStore.getState();
const card = { id: 'sf-1' } as { id: string };
let synced = 0;

useCollectionStore.setState({ entries: {} });
store.addCards(card as never, 3, 'user-1', () => synced++, { condition: 'NM' });

const entries = Object.values(useCollectionStore.getState().entries);
check('3 entries added to state', entries.length === 3);
check('3 distinct rowIds', new Set(Object.keys(useCollectionStore.getState().entries)).size === 3);
check(
	'all carry scryfallId',
	entries.every((e) => e.scryfallId === 'sf-1')
);
check(
	'patch applied',
	entries.every((e) => e.entry.condition === 'NM')
);
check('triggerSync called once', synced === 1);

// clamp delegated to buildEntriesBatch: count 0 → 1 entry
useCollectionStore.setState({ entries: {} });
store.addCards(card as never, 0, 'user-1', () => {}, undefined);
check('count 0 → 1 entry', Object.keys(useCollectionStore.getState().entries).length === 1);

// No userId → optimistic state still updated, triggerSync NOT called
useCollectionStore.setState({ entries: {} });
let synced2 = 0;
store.addCards(card as never, 2, null, () => synced2++, undefined);
check(
	'no-user: 2 entries in state',
	Object.keys(useCollectionStore.getState().entries).length === 2
);
check('no-user: triggerSync not called', synced2 === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/collection/store/add-cards.test.ts`
Expected: FAIL — `store.addCards is not a function`.

- [ ] **Step 3: Dedupe `newEntry` — import it from the shared module**

In `src/lib/collection/store/collection-store.ts`, delete the local definition:

```ts
function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}
```

and add to the import block near the top (after the existing `import type { CardEntry } from '@/types/cards';`):

```ts
import { buildEntriesBatch, newEntry } from '@/lib/card/entry/buildEntriesBatch';
```

- [ ] **Step 4: Declare the `addCards` action type**

In the `CollectionActions` type, immediately after the `addCard: (...) => void;` declaration (the block ending at `entryPatch?: Partial<CardEntry>\n\t) => void;`), add:

```ts
	addCards: (
		card: ScryfallCard,
		count: number,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>
	) => void;
```

- [ ] **Step 5: Implement `addCards` in the store creator**

In the store object, immediately after the existing `addCard: (...) => { ... },` implementation block, add:

```ts
	addCards: (card, count, userId, triggerSync, entryPatch) => {
		const rows = buildEntriesBatch(card.id, count, entryPatch);
		set((state) => {
			const next = { ...state.entries };
			for (const { rowId, scryfallId, entry } of rows) {
				next[rowId] = { scryfallId, entry };
			}
			return { entries: next };
		});
		if (userId) {
			enqueue({ type: 'bulk-insert', payload: { userId, rows } });
			triggerSync();
		}
	},
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx src/lib/collection/store/add-cards.test.ts`
Expected: `8 passed, 0 failed`.

- [ ] **Step 7: Verify lint/types**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/collection/store/collection-store.ts src/lib/collection/store/add-cards.test.ts
git commit -m "feat(collection): add addCards store action via buildEntriesBatch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wishlist store `addToWishlist` gains `count` (+ dedupe `newEntry`)

**Files:**

- Modify: `src/lib/wishlist/store/wishlist-store.ts`
- Create: `src/lib/wishlist/store/add-to-wishlist.test.ts`

**Interfaces:**

- Consumes: `buildEntriesBatch`, `newEntry` from `@/lib/card/entry/buildEntriesBatch` (Task 1); `bulk-insert` op with `wishlist?` (Task 2).
- Produces: store action `addToWishlist(card, userId, triggerSync, entryPatch?, count = 1)`.

- [ ] **Step 1: Write the failing test**

Asserts on store STATE only (same rationale as Task 3: `enqueue` no-ops without `window` under `tsx`). Create `src/lib/wishlist/store/add-to-wishlist.test.ts`:

```ts
import { useWishlistStore } from './wishlist-store';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

const store = useWishlistStore.getState();
const card = { id: 'sf-9' } as { id: string };
let synced = 0;

// count = 3 → 3 entries
useWishlistStore.setState({ entries: {} });
store.addToWishlist(card as never, 'user-1', () => synced++, { condition: 'LP' }, 3);

const entries = Object.values(useWishlistStore.getState().entries);
check('3 entries added', entries.length === 3);
check('3 distinct rowIds', new Set(Object.keys(useWishlistStore.getState().entries)).size === 3);
check(
	'all carry scryfallId',
	entries.every((e) => e.scryfallId === 'sf-9')
);
check(
	'patch applied',
	entries.every((e) => e.entry.condition === 'LP')
);
check('triggerSync called once', synced === 1);

// default count (backward-compatible 4-arg call) → 1 entry
useWishlistStore.setState({ entries: {} });
store.addToWishlist(card as never, 'user-1', () => {}, { condition: 'NM' });
check('default count → 1 entry', Object.keys(useWishlistStore.getState().entries).length === 1);

// no userId → state updated, triggerSync not called
useWishlistStore.setState({ entries: {} });
let synced2 = 0;
store.addToWishlist(card as never, null, () => synced2++, undefined, 2);
check('no-user: 2 entries', Object.keys(useWishlistStore.getState().entries).length === 2);
check('no-user: triggerSync not called', synced2 === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/wishlist/store/add-to-wishlist.test.ts`
Expected: FAIL — `count = 3` is ignored by the current `addToWishlist`, so only 1 entry is added (the `3 entries added` check fails).

- [ ] **Step 3: Dedupe `newEntry` — import from shared module**

In `src/lib/wishlist/store/wishlist-store.ts`, delete the local definition:

```ts
function newEntry(rowId: string, overrides?: Partial<CardEntry>): CardEntry {
	return { rowId, dateAdded: new Date().toISOString(), ...overrides };
}
```

and add to the imports (after `import { enqueue } from '@/lib/supabase/sync-queue';`):

```ts
import { buildEntriesBatch, newEntry } from '@/lib/card/entry/buildEntriesBatch';
```

> Note: `newEntry` is still imported because `changePrint` / other actions in this file may use it. If after deletion `newEntry` is unused, ESLint will flag it — in that case import only `buildEntriesBatch`. Check usages before finalizing the import line.

- [ ] **Step 4: Update the `addToWishlist` action type**

In `WishlistActions`, replace:

```ts
	addToWishlist: (
		card: ScryfallCard,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>
	) => void;
```

with:

```ts
	addToWishlist: (
		card: ScryfallCard,
		userId: string | null,
		triggerSync: () => void,
		entryPatch?: Partial<CardEntry>,
		count?: number
	) => void;
```

- [ ] **Step 5: Reimplement `addToWishlist`**

Replace the current implementation:

```ts
	addToWishlist: (card, userId, triggerSync, entryPatch) => {
		const newRowId = crypto.randomUUID();
		const entry = newEntry(newRowId, entryPatch);
		set((state) => ({
			entries: { [newRowId]: { scryfallId: card.id, entry }, ...state.entries },
		}));
		if (userId) {
			enqueue({
				type: 'insert',
				payload: { userId, rowId: newRowId, scryfallId: card.id, entry, wishlist: true },
			});
			triggerSync();
		}
	},
```

with:

```ts
	addToWishlist: (card, userId, triggerSync, entryPatch, count = 1) => {
		const rows = buildEntriesBatch(card.id, count, entryPatch);
		set((state) => {
			const next = { ...state.entries };
			for (const { rowId, scryfallId, entry } of rows) {
				next[rowId] = { scryfallId, entry };
			}
			return { entries: next };
		});
		if (userId) {
			enqueue({ type: 'bulk-insert', payload: { userId, rows, wishlist: true } });
			triggerSync();
		}
	},
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx src/lib/wishlist/store/add-to-wishlist.test.ts`
Expected: `8 passed, 0 failed`.

- [ ] **Step 7: Verify lint/types**

Run: `npm run check`
Expected: PASS. (Existing `store.addToWishlist(card, userId, triggerSync, patch)` calls — e.g. in `duplicateEntry` and `WishlistContext` — stay valid; `count` defaults to 1.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/wishlist/store/wishlist-store.ts src/lib/wishlist/store/add-to-wishlist.test.ts
git commit -m "feat(wishlist): addToWishlist supports count via bulk-insert

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Expose `addCards` / `count` in the contexts

**Files:**

- Modify: `src/lib/collection/context/CollectionContext.tsx`
- Modify: `src/lib/wishlist/context/WishlistContext.tsx`

**Interfaces:**

- Consumes: store `addCards` (Task 3); store `addToWishlist(..., count?)` (Task 4).
- Produces:
  - `CollectionContext.addCards(card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) => void`
  - `WishlistContext.addToWishlist(card: ScryfallCard, entryPatch?: Partial<CardEntry>, count?: number) => void`

- [ ] **Step 1: CollectionContext — add `addCards` to the value type**

In `src/lib/collection/context/CollectionContext.tsx`, find the context value type with `addCard: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;` and add directly below it:

```ts
	addCards: (card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) => void;
```

- [ ] **Step 2: CollectionContext — bind `addCards`**

After the existing `addCard` `useCallback` binding (~lines 73-77), add:

```ts
const addCards = useCallback(
	(card: ScryfallCard, count: number, entryPatch?: Partial<CardEntry>) =>
		store.addCards(card, count, userId, triggerSync, entryPatch),
	[store, userId, triggerSync]
);
```

Then add `addCards,` to the `value` object (next to `addCard,`).

- [ ] **Step 3: WishlistContext — widen `addToWishlist` type**

In `src/lib/wishlist/context/WishlistContext.tsx`, change the value type line:

```ts
	addToWishlist: (card: ScryfallCard, entryPatch?: Partial<CardEntry>) => void;
```

to:

```ts
	addToWishlist: (card: ScryfallCard, entryPatch?: Partial<CardEntry>, count?: number) => void;
```

- [ ] **Step 4: WishlistContext — pass `count` through the binding**

Replace the `addToWishlist` `useCallback`:

```ts
const addToWishlist = useCallback(
	(card: ScryfallCard, entryPatch?: Partial<CardEntry>) =>
		store.addToWishlist(card, userId, triggerSync, entryPatch),
	[store, userId, triggerSync]
);
```

with:

```ts
const addToWishlist = useCallback(
	(card: ScryfallCard, entryPatch?: Partial<CardEntry>, count?: number) =>
		store.addToWishlist(card, userId, triggerSync, entryPatch, count),
	[store, userId, triggerSync]
);
```

- [ ] **Step 5: Verify lint/types**

Run: `npm run check`
Expected: PASS. (`duplicateEntry` in WishlistContext still calls `store.addToWishlist(stubCard, userId, triggerSync, patch)` — valid, `count` undefined → store default 1.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/collection/context/CollectionContext.tsx src/lib/wishlist/context/WishlistContext.tsx
git commit -m "feat(context): expose addCards and wishlist count

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `EditCardModal` — single `onAdd(card, entry, count)`, no loop

**Files:**

- Modify: `src/lib/card/components/EditCardModal/EditCardModal.tsx`

**Interfaces:**

- Consumes: nothing from prior tasks (signature change only).
- Produces: `AddProps.onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void`.

- [ ] **Step 1: Change the `onAdd` prop type**

In `src/lib/card/components/EditCardModal/EditCardModal.tsx`, in the `AddProps` interface, change:

```ts
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>) => void;
```

to:

```ts
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
```

- [ ] **Step 2: Replace the loop in `handleConfirmAdd` with a single call**

Replace the current `handleConfirmAdd`:

```ts
function handleConfirmAdd() {
	if (addMode) {
		const count = Math.max(1, Math.floor(quantity) || 1);
		for (let i = 0; i < count; i++) {
			props.onAdd(selectedPrint, draftEntry);
		}
		props.onClose();
	}
}
```

with:

```ts
function handleConfirmAdd() {
	if (addMode) {
		props.onAdd(selectedPrint, draftEntry, quantity);
		props.onClose();
	}
}
```

(The clamp now lives in `buildEntriesBatch`; the `quantity` input still has `min={1}` and its `onChange` clamp, so it never sends < 1 anyway.)

- [ ] **Step 3: Verify lint/types**

Run: `npm run check`
Expected: This will FAIL to typecheck at the call-sites that pass an `onAdd` not yet accepting a 3rd arg ONLY if those arrows are typed too narrowly — but inline arrows like `(print, entry) => ...` structurally satisfy `(card, entry, count) => void` (extra param ignored). So `npm run check` should PASS here. If any call-site fails, it will be fixed in Task 7; note it and proceed.

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/EditCardModal/EditCardModal.tsx
git commit -m "refactor(edit-card-modal): onAdd passes count, single call

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Migrate the 5 add-to-collection/wishlist call-sites to the batch path

**Files:**

- Modify: `src/app/search/page.tsx` (~lines 370-385)
- Modify: `src/app/card/[id]/components/AddToCollectionButton/AddToCollectionButton.tsx` (`handleAdd`, ~lines 27-30)
- Modify: `src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx` (~lines 179, 191)
- Modify: `src/app/decks/[id]/DeckDetailReadOnlyView.tsx` (`handleAddToCollection`, ~lines 106-112)

**Interfaces:**

- Consumes: `CollectionContext.addCards(card, count, entryPatch?)` and `WishlistContext.addToWishlist(card, entryPatch?, count?)` (Task 5); `EditCardModal.onAdd(card, entry, count)` (Task 6).
- Produces: end-user behavior. Nothing downstream depends on these.

Note: `CardModal.tsx`'s three `EditCardModal mode="add"` usages are intentionally NOT migrated here — the `addingCopy` one routes to `onIncrement` (always +1), and the `onAddToCollection`/`onAddToWishlist` prop callbacks are the responsibility of `CardModal`'s own consumers. Their inline arrows `(print, entry) => ...` remain type-valid against the new `onAdd` signature (extra `count` arg ignored). Leave them unchanged. Verify they still typecheck.

- [ ] **Step 1: Search page — route to batch with count**

In `src/app/search/page.tsx`, find the add modal's `onAdd` (currently):

```tsx
					onAdd={(card, entry) => {
						if (addModal.target === 'collection') {
							addCard(card, entry);
						} else {
							addToWishlist(card, entry);
						}
					}}
```

Replace with:

```tsx
					onAdd={(card, entry, count) => {
						if (addModal.target === 'collection') {
							addCards(card, count, entry);
						} else {
							addToWishlist(card, entry, count);
						}
					}}
```

Then update the destructure: change `const { addCard } = useCollectionContext();` to `const { addCards } = useCollectionContext();` (if `addCard` is used elsewhere in the file, keep both: `const { addCard, addCards } = useCollectionContext();` — grep the file for other `addCard(` uses first).

- [ ] **Step 2: AddToCollectionButton — use `addCards`**

In `src/app/card/[id]/components/AddToCollectionButton/AddToCollectionButton.tsx`:

Change the destructure `const { addCard, decrementCard, getQuantity } = useCollectionContext();` to:

```ts
const { addCards, decrementCard, getQuantity } = useCollectionContext();
```

Replace `handleAdd`:

```ts
function handleAdd(selectedCard: ScryfallCard, entry: Partial<CardEntry>) {
	addCard(selectedCard, entry);
	setShowFeedback(true);
}
```

with:

```ts
function handleAdd(selectedCard: ScryfallCard, entry: Partial<CardEntry>, count: number) {
	addCards(selectedCard, count, entry);
	setShowFeedback(true);
}
```

(`handleAdd` is passed as `onAdd={handleAdd}` to both `EditCardModal` instances; the new 3-arg signature matches.)

- [ ] **Step 3: PrintsTab — collection + wishlist with count**

In `src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx`:

Change the destructure to use `addCards` (grep for `addCard(` first to decide whether to keep `addCard` too). Find:

```tsx
				onAdd={(selectedPrint, entry) => {
					addCard(selectedPrint, entry);
					setAddingCard(null);
				}}
```

Replace with:

```tsx
				onAdd={(selectedPrint, entry, count) => {
					addCards(selectedPrint, count, entry);
					setAddingCard(null);
				}}
```

And find:

```tsx
				onAdd={(selectedPrint, entry) => {
					addToWishlist(selectedPrint, entry);
					setAddingToWishlist(null);
				}}
```

Replace with:

```tsx
				onAdd={(selectedPrint, entry, count) => {
					addToWishlist(selectedPrint, entry, count);
					setAddingToWishlist(null);
				}}
```

Update the context destructure: `addCard` → `addCards` (collection), `addToWishlist` already correct.

- [ ] **Step 4: DeckDetailReadOnlyView — use `addCards`**

In `src/app/decks/[id]/DeckDetailReadOnlyView.tsx`, change the destructure of `addCard` to `addCards` (grep for other `addCard(` uses first), and replace `handleAddToCollection`:

```ts
const handleAddToCollection = useCallback(
	(selectedCard: ScryfallCard, entry: Partial<CardEntry>) => {
		addCard(selectedCard, entry);
		setAddToCollectionCard(null);
	},
	[addCard]
);
```

with:

```ts
const handleAddToCollection = useCallback(
	(selectedCard: ScryfallCard, entry: Partial<CardEntry>, count: number) => {
		addCards(selectedCard, count, entry);
		setAddToCollectionCard(null);
	},
	[addCards]
);
```

- [ ] **Step 5: Verify lint/types**

Run: `npm run check`
Expected: PASS. Watch for: any place still destructuring `addCard` that no longer uses it → ESLint unused-var. Remove the unused binding or keep it only if still referenced.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Sign in. On `/search`:

- Right-click an official card → "Ajouter à la collection…" → set Quantité 3 → confirm.
- Confirm 3 copies appear in the collection.
- In the browser Network tab, confirm a SINGLE `POST` to the `cards` table (one INSERT), not three.
- Repeat for "Ajouter à la wishlist…" → 3 wishlist copies, one INSERT, rows carry `wishlist=true`.
- Sanity-check the other add flows still work: card page "Add to Collection" with quantity 2, deck read-only add to collection.

- [ ] **Step 7: Commit**

```bash
git add src/app/search/page.tsx src/app/card/[id]/components/AddToCollectionButton/AddToCollectionButton.tsx src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx src/app/decks/[id]/DeckDetailReadOnlyView.tsx
git commit -m "refactor(add-flows): route quantity adds through bulk addCards/addToWishlist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- §0 `buildEntriesBatch` + shared `newEntry` → Task 1. ✓
- §1 bulk-insert carries `wishlist` (sync-queue + executeOp + insertEntries) → Task 2. ✓
- §2 `addCards` (collection) → Task 3; `addToWishlist` count (wishlist) → Task 4. ✓
- §3 contexts expose `addCards` / `count` → Task 5. ✓
- §4 `EditCardModal` single `onAdd(card, entry, count)` → Task 6. ✓
- §5 call-sites migrated → Task 7. ✓
- Clamp lives only in `buildEntriesBatch` → Task 1 (and Task 6 removes the modal's loop-clamp). ✓
- `newEntry` deduped → Tasks 3 & 4 delete local copies, import shared. ✓
- One bulk-insert per add → NOT unit-asserted (the sync-queue's `enqueue` no-ops without `window`/`localStorage` under `tsx`, so the op is unobservable in tests). Guaranteed instead by: `buildEntriesBatch` returning one `rows` array (Task 1 test), the store code enqueueing exactly one op against that array (code review), and the manual single-INSERT Network check (Task 7 Step 6). ✓

**Placeholder scan:** No TBD/TODO. Every code step has complete code. The two "grep first" notes (Tasks 3-import, 7-destructure) are concrete verification instructions, not placeholders. ✓

**Type consistency:** `addCards(card, count, userId, triggerSync, entryPatch?)` (store, Task 3) ↔ `addCards(card, count, entryPatch?)` (context, Task 5) ↔ `addCards(card, count, entry)` (call-sites, Task 7) — consistent (context binds userId/triggerSync). `addToWishlist(card, userId, triggerSync, entryPatch?, count?)` (store, Task 4) ↔ `addToWishlist(card, entryPatch?, count?)` (context, Task 5) ↔ `addToWishlist(card, entry, count)` (call-sites, Task 7) — consistent. `onAdd(card, entry, count)` (Task 6) matches call-site arrows (Task 7). `bulk-insert` payload `{ userId, rows, wishlist? }` consistent across Tasks 2, 3, 4. ✓

**Test-runner note for implementers:** This repo's `tsx` compiles to CJS — top-level `await import()` is NOT supported (verified), and the sync-queue's `enqueue` no-ops without `window`/`localStorage`, so enqueued ops cannot be observed from a test. Therefore the Task 3 & 4 store tests assert on store STATE and on the caller-supplied `triggerSync` callback only — exactly the pattern in `src/lib/deck/store/unassign-collection-copy.test.ts`. Do not attempt to mock `enqueue`. The "one bulk-insert per add" property is verified by code review + the manual Network check (Task 7 Step 6).
