# Supabase Boundary Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/lib/supabase/` the single place that touches the Supabase client, so a future migration to another backend rewrites one folder; keep all `row → domain type` mapping in the feature modules.

**Architecture:** Introduce a thin "queries" layer under `src/lib/supabase/queries/` that owns every `client.from(...)` / `client.auth.*` / `client.storage.*` call and returns/accepts **row-shaped** data only. Each feature's `db/` module (collection, deck, wishlist, mpc) calls these queries and does the domain mapping. Auth call sites in `src/app/` move to `src/lib/supabase/auth/` helpers. Two non-Supabase file moves (`WishlistIcon`, `LocalizedCardThumb`) and one misplaced module move (`custom-cards` → `mpc/db/`) clean up domain-coupling violations. Finally, document the rule.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase JS client, ESLint + Prettier (tabs width 2, single quotes, trailing comma es5).

## Global Constraints

- **No barrel exports** (`index.ts`). Import files directly. (AGENTS.md rule 2)
- **No test framework exists.** The verification gate for every task is `npm run check` (tsc --noEmit + eslint + prettier --check). A task "passes" when `npm run check` exits 0.
- **Prettier style:** tabs (width 2), single quotes, trailing commas es5. Run `npm run check:fix` if formatting fails, then re-run `npm run check`.
- **Path alias:** `@/*` → `./src/*`. Always import via `@/lib/...`, never relative `../../`.
- **The single-folder rule (the whole point):** after this plan, `grep -rn "createClient\|\.from(\|\.auth\.\|\.storage\." src` must show Supabase-client usage ONLY under `src/lib/supabase/`. The one allowed exception is `src/proxy.ts` (Next.js middleware entry, framework-imposed) which calls `src/lib/supabase/middleware.ts`.
- **Behavior must not change.** This is a pure reorganization. No query semantics, column names, filters, batch sizes, or error messages change.
- **Commit after every task** with the message shown in that task's final step.

---

## File Structure

New / moved files this plan produces:

```
src/lib/supabase/
  queries/
    cards.ts          # all client.from('cards' | 'public_collection_cards') calls (rows in/out)
    decks.ts          # all client.from('decks' | 'deck_folders') calls (rows in/out)
    custom-cards.ts   # all client.from('custom_cards' | 'custom_card_sources') calls + queryCustomCardRows
  auth/
    auth-server.ts    # server-side getCurrentUser() (wraps server createClient + getUser)
    auth-client.ts    # client-side signInWithOtp() / verifyOtp() wrappers
  (custom-cards.ts and custom-cards.server.ts are DELETED — split into queries + mpc/db)

src/lib/collection/db/collection.ts   # now imports row queries from supabase/queries/cards
src/lib/deck/db/decks.ts              # now imports row queries from supabase/queries/decks
src/lib/deck/db/folders.ts            # now imports row queries from supabase/queries/decks
src/lib/wishlist/db/wishlist.ts       # now imports row queries from supabase/queries/cards

src/lib/mpc/db/custom-cards.ts        # MOVED from supabase/custom-cards.ts (mapping + query orchestration)
src/lib/mpc/db/custom-cards.server.ts # MOVED from supabase/custom-cards.server.ts

src/lib/wishlist/components/WishlistIcon.tsx   # MOVED from src/components/WishlistIcon.tsx
src/app/card/[id]/components/LocalizedCardThumb.tsx # MOVED from src/lib/card/components/LocalizedCardThumb.tsx

docs/feature-modules.md               # documents functional-domain vs external-integration rule
AGENTS.md                             # short cross-reference to the rule
```

**Boundary definition used throughout this plan:**

- **Queries layer (`supabase/queries/*`)** = functions that call `client.from(...).select/insert/update/delete(...)`, build column payloads, build Supabase filter clauses, and return **rows** (`CardDbRow[]`, `DeckDbRow[]`, `CustomCardRow[]`) or accept row-shaped payloads. No domain types (`CardEntry`, `DeckMeta`, `MpcCard`) appear here.
- **Domain `db/` (`collection/db`, `deck/db`, `wishlist/db`, `mpc/db`)** = functions that call the queries layer and do `rowTo<DomainType>` / `<domainType>ToRow` mapping. No `createClient` / `.from(` here.

Row types (`CardDbRow`, `DeckDbRow`, `FolderDbRow`, `CustomCardRow`, `CustomCardSourceRow`) are the shared contract between the two layers. `CardDbRow` already lives in `src/lib/card/db/cardRow.ts` and is imported by both layers.

---

### Task 1: Move `LocalizedCardThumb` to its single owning page

`LocalizedCardThumb.tsx` is used only by `/card/[id]` (PrintsTab + SimilarTab, same page). Per AGENTS.md rule 3, single-page components live in `src/app/<page>/components/`. No Supabase involved — this is the simplest move, done first to warm up.

**Files:**

- Move: `src/lib/card/components/LocalizedCardThumb.tsx` → `src/app/card/[id]/components/LocalizedCardThumb.tsx`
- Modify: `src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx` (import path)
- Modify: `src/app/card/[id]/components/tabs/SimilarTab/SimilarTab.tsx` (import path)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `LocalizedCardThumb` now at `@/app/card/[id]/components/LocalizedCardThumb` — but verify the actual import specifier the new file path requires (see step 2).

- [ ] **Step 1: Move the file with git**

```bash
git mv src/lib/card/components/LocalizedCardThumb.tsx "src/app/card/[id]/components/LocalizedCardThumb.tsx"
```

- [ ] **Step 2: Find the current import specifier and the new one**

Run:

```bash
grep -rn "LocalizedCardThumb" "src/app/card/[id]" | grep import
```

Expected: two lines in `PrintsTab.tsx` and `SimilarTab.tsx`, each importing from a path like `@/lib/card/components/LocalizedCardThumb`. The new location is `src/app/card/[id]/components/LocalizedCardThumb.tsx`; from `tabs/PrintsTab/PrintsTab.tsx` the relative path is `../../LocalizedCardThumb`.

- [ ] **Step 3: Update PrintsTab import**

In `src/app/card/[id]/components/tabs/PrintsTab/PrintsTab.tsx`, change the import from the old `@/lib/card/components/LocalizedCardThumb` to `../../LocalizedCardThumb`.

- [ ] **Step 4: Update SimilarTab import**

In `src/app/card/[id]/components/tabs/SimilarTab/SimilarTab.tsx`, change the import from the old `@/lib/card/components/LocalizedCardThumb` to `../../LocalizedCardThumb`.

- [ ] **Step 5: Verify no stale references remain**

Run:

```bash
grep -rn "lib/card/components/LocalizedCardThumb" src
```

Expected: no output.

- [ ] **Step 6: Run the check gate**

Run: `npm run check`
Expected: exit 0 (no TypeScript, ESLint, or Prettier errors). If Prettier complains, run `npm run check:fix` then `npm run check` again.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move LocalizedCardThumb to its owning card page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Move `WishlistIcon` into the wishlist feature

`WishlistIcon.tsx` sits in generic `src/components/` but is domain-coupled to the wishlist feature and used by ≥2 pages (Navbar, wishlist page, CardModal, DeckDetailOwnerView). Per "Feature components vs generic UI", domain-coupled shared components belong in `src/lib/<feature>/components/`.

**Files:**

- Move: `src/components/WishlistIcon.tsx` → `src/lib/wishlist/components/WishlistIcon.tsx`
- Modify imports in: `src/components/Navbar/Navbar.tsx`, `src/components/Navbar/NavbarDrawer.tsx`, `src/app/wishlist/page.tsx`, `src/lib/card/components/CardModal/CardModal.tsx`, `src/app/decks/[id]/DeckDetailOwnerView.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `WishlistIcon` now importable from `@/lib/wishlist/components/WishlistIcon`.

- [ ] **Step 1: Move the file with git**

```bash
git mv src/components/WishlistIcon.tsx src/lib/wishlist/components/WishlistIcon.tsx
```

- [ ] **Step 2: Find all importers**

Run:

```bash
grep -rln "components/WishlistIcon\|/WishlistIcon'" src | grep -v "wishlist/components/WishlistIcon.tsx"
```

Expected: the five files listed above.

- [ ] **Step 3: Repoint every importer**

In each of the five files, replace the old specifier (`@/components/WishlistIcon`) with `@/lib/wishlist/components/WishlistIcon`. Use a single sweep:

```bash
grep -rl "@/components/WishlistIcon" src | xargs sed -i "s#@/components/WishlistIcon#@/lib/wishlist/components/WishlistIcon#g"
```

- [ ] **Step 4: Verify no stale references remain**

Run:

```bash
grep -rn "@/components/WishlistIcon" src
```

Expected: no output.

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: exit 0. If Prettier complains, run `npm run check:fix` then re-run.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move WishlistIcon into wishlist feature module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Create the `cards` queries layer (rows only)

Extract every `client.from('cards' | 'public_collection_cards')` call used by collection + wishlist into `src/lib/supabase/queries/cards.ts`. These functions take/return rows (`CardDbRow`), never `CardEntry`. The domain `db/` files are rewired in Tasks 4–5.

**Files:**

- Create: `src/lib/supabase/queries/cards.ts`

**Interfaces:**

- Consumes: `CardDbRow` from `@/lib/card/db/cardRow`.
- Produces (exact signatures the domain db layers will call in Tasks 4–5):
  - `fetchCardRowsPage(table: 'cards' | 'public_collection_cards', filter: { ownerId: string; from: number; pageSize: number }): Promise<{ rows: CardDbRow[]; hasMore: boolean }>` (preserves original `hasMore: data.length === pageSize` semantics; no total-count query)
  - `fetchWishlistCardRowsPage(userId: string, from: number, pageSize: number): Promise<{ rows: CardDbRow[]; hasMore: boolean }>`
  - `insertCardRows(rows: Record<string, unknown>[]): Promise<void>`
  - `deleteCardRowsByIds(ownerId: string, ids: string[]): Promise<void>`
  - `updateCardRow(ownerId: string, rowId: string, payload: Record<string, unknown>): Promise<void>`
  - `CARDS_TABLE` / `PUBLIC_CARDS_TABLE` string constants are NOT exported; callers pass the literal.

- [ ] **Step 1: Write `src/lib/supabase/queries/cards.ts`**

```ts
import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';

/**
 * Raw Supabase access for the `cards` table and its public view. This file is
 * the ONLY place that issues client.from('cards'|'public_collection_cards')
 * calls; domain mapping (row <-> CardEntry) lives in collection/db + wishlist/db.
 */

export async function fetchCardRowsPage(
	table: 'cards' | 'public_collection_cards',
	filter: { ownerId: string; from: number; pageSize: number }
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from(table)
		.select('*')
		.eq('owner_id', filter.ownerId)
		.eq('wishlist', false)
		.range(filter.from, filter.from + filter.pageSize - 1);

	if (error) {
		console.error(`[queries/cards] fetchCardRowsPage(${table}) error:`, error);
		return { rows: [], hasMore: false };
	}
	return { rows: data as CardDbRow[], hasMore: data.length === filter.pageSize };
}

export async function fetchWishlistCardRowsPage(
	userId: string,
	from: number,
	pageSize: number
): Promise<{ rows: CardDbRow[]; hasMore: boolean }> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('wishlist', true)
		.or(`owner_id.eq.${userId},deck_id.not.is.null`)
		.range(from, from + pageSize - 1);

	if (error) {
		console.error('[queries/cards] fetchWishlistCardRowsPage error:', error);
		return { rows: [], hasMore: false };
	}
	return { rows: data as CardDbRow[], hasMore: data.length === pageSize };
}

export async function insertCardRows(rows: Record<string, unknown>[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(rows);
	if (error) {
		throw new Error(`[queries/cards] insertCardRows error: ${error.message}`);
	}
}

export async function deleteCardRowsByIds(ownerId: string, ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('owner_id', ownerId).in('id', ids);
	if (error) {
		throw new Error(`[queries/cards] deleteCardRowsByIds error: ${error.message}`);
	}
}

export async function updateCardRow(
	ownerId: string,
	rowId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', rowId);
	if (error) {
		throw new Error(`[queries/cards] updateCardRow error: ${error.message}`);
	}
}
```

- [ ] **Step 2: Run the check gate**

Run: `npm run check`
Expected: exit 0. The file is not yet imported anywhere; this verifies it compiles standalone. If Prettier complains, run `npm run check:fix` then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/cards.ts
git commit -m "refactor(supabase): add cards queries layer (rows only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Rewire `collection/db/collection.ts` to the cards queries layer

Replace every inline `createClient()` / `.from('cards')` in collection's db with calls to `supabase/queries/cards`. Keep all `rowToCardEntry` / `cardEntryToRow` mapping and the batch-size loops here. Page size constant stays in the domain layer and is passed to the query.

**Files:**

- Modify: `src/lib/collection/db/collection.ts` (full rewrite of body; public function signatures unchanged)

**Interfaces:**

- Consumes (from Task 3): `fetchCardRowsPage`, `insertCardRows`, `deleteCardRowsByIds`, `updateCardRow` from `@/lib/supabase/queries/cards`.
- Produces: unchanged public API — `fetchCollectionPage`, `fetchPublicCollectionPage`, `insertEntry`, `insertEntries`, `deleteEntryById`, `deleteEntries`, `updateEntry` keep identical signatures so no caller changes.

- [ ] **Step 1: Rewrite `src/lib/collection/db/collection.ts`**

```ts
import type { CardEntry } from '@/types/cards';
import {
	type CardDbRow,
	rowToCardEntry,
	cardEntryToRow,
	normalizeCondition,
} from '@/lib/card/db/cardRow';
import {
	fetchCardRowsPage,
	insertCardRows,
	deleteCardRowsByIds,
	updateCardRow,
} from '@/lib/supabase/queries/cards';

const DB_FETCH_PAGE_SIZE = 1000;

function mapRows(rows: CardDbRow[]): Array<{ scryfallId: string; entry: CardEntry }> {
	return rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) }));
}

export async function fetchCollectionPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const { rows, hasMore } = await fetchCardRowsPage('cards', {
		ownerId: userId,
		from,
		pageSize: DB_FETCH_PAGE_SIZE,
	});
	return { rows: mapRows(rows), hasMore };
}

/**
 * Public, read-only variant: reads the `public_collection_cards` view (omits
 * `purchase_price`) so a visitor can view any user's collection without their
 * financial data. Excludes wishlist rows, mirroring the owner page.
 */
export async function fetchPublicCollectionPage(
	ownerId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	const { rows, hasMore } = await fetchCardRowsPage('public_collection_cards', {
		ownerId,
		from,
		pageSize: DB_FETCH_PAGE_SIZE,
	});
	return { rows: mapRows(rows), hasMore };
}

export async function insertEntry(
	userId: string,
	scryfallId: string,
	entry: CardEntry,
	wishlist = false
): Promise<void> {
	await insertCardRows([{ ...cardEntryToRow(scryfallId, entry), owner_id: userId, wishlist }]);
}

const INSERT_BATCH_SIZE = 500;

export async function insertEntries(
	userId: string,
	rows: Array<{ scryfallId: string; entry: CardEntry }>,
	wishlist = false
): Promise<void> {
	if (rows.length === 0) return;
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
		await insertCardRows(
			batch.map((r) => ({ ...cardEntryToRow(r.scryfallId, r.entry), owner_id: userId, wishlist }))
		);
	}
}

export async function deleteEntryById(userId: string, rowId: string): Promise<void> {
	await deleteCardRowsByIds(userId, [rowId]);
}

const DELETE_BATCH_SIZE = 50;

export async function deleteEntries(userId: string, rowIds: string[]): Promise<void> {
	if (rowIds.length === 0) return;
	for (let i = 0; i < rowIds.length; i += DELETE_BATCH_SIZE) {
		await deleteCardRowsByIds(userId, rowIds.slice(i, i + DELETE_BATCH_SIZE));
	}
}

export async function updateEntry(
	userId: string,
	rowId: string,
	entry: CardEntry,
	scryfallId?: string
): Promise<void> {
	await updateCardRow(userId, rowId, {
		date_added: entry.dateAdded,
		is_foil: entry.isFoil ?? null,
		foil_type: entry.foilType ?? null,
		condition: normalizeCondition(entry.condition),
		language: entry.language ?? null,
		purchase_price: entry.purchasePrice ?? null,
		for_trade: entry.forTrade ?? null,
		alter: entry.alter ?? null,
		proxy: entry.proxy ?? null,
		tags: entry.tags ?? null,
		deck_id: entry.deckId ?? null,
		// Changing the print (edition) must patch the existing row in place so the
		// card keeps its identity (rowId) across collection/deck/wishlist views.
		...(scryfallId !== undefined ? { scryfall_id: scryfallId } : {}),
	});
}
```

- [ ] **Step 2: Confirm no client usage remains in this file**

Run:

```bash
grep -n "createClient\|\.from(" src/lib/collection/db/collection.ts
```

Expected: no output.

- [ ] **Step 3: Run the check gate**

Run: `npm run check`
Expected: exit 0. If Prettier complains, run `npm run check:fix` then re-run.

- [ ] **Step 4: Commit**

```bash
git add src/lib/collection/db/collection.ts
git commit -m "refactor(collection): route db through supabase/queries/cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Rewire `wishlist/db/wishlist.ts` to the cards queries layer

**Files:**

- Modify: `src/lib/wishlist/db/wishlist.ts` (full rewrite; signature unchanged)

**Interfaces:**

- Consumes (from Task 3): `fetchWishlistCardRowsPage` from `@/lib/supabase/queries/cards`.
- Produces: unchanged `fetchWishlistPage(userId, from)` signature.

- [ ] **Step 1: Rewrite `src/lib/wishlist/db/wishlist.ts`**

```ts
import type { CardEntry } from '@/types/cards';
import { rowToCardEntry } from '@/lib/card/db/cardRow';
import { fetchWishlistCardRowsPage } from '@/lib/supabase/queries/cards';

const DB_FETCH_PAGE_SIZE = 1000;

export async function fetchWishlistPage(
	userId: string,
	from: number
): Promise<{ rows: Array<{ scryfallId: string; entry: CardEntry }>; hasMore: boolean }> {
	// A wishlist row may be a standalone wishlist card (owner_id = userId) OR a
	// deck card flagged wishlist in place (owner_id null, deck_id set). The latter
	// is reachable via deck ownership; RLS already restricts visibility to the
	// user's own rows, so the deck-card branch can match on deck_id presence.
	const { rows, hasMore } = await fetchWishlistCardRowsPage(userId, from, DB_FETCH_PAGE_SIZE);
	return {
		rows: rows.map((row) => ({ scryfallId: row.scryfall_id, entry: rowToCardEntry(row) })),
		hasMore,
	};
}
```

- [ ] **Step 2: Confirm no client usage remains**

Run:

```bash
grep -n "createClient\|\.from(" src/lib/wishlist/db/wishlist.ts
```

Expected: no output.

- [ ] **Step 3: Run the check gate**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wishlist/db/wishlist.ts
git commit -m "refactor(wishlist): route db through supabase/queries/cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Create the `decks` queries layer (rows only)

Extract every `client.from('decks' | 'deck_folders' | 'cards')` call used by `deck/db/decks.ts` + `deck/db/folders.ts` into `src/lib/supabase/queries/decks.ts`. Returns rows / accepts payloads. The `cards`-table deck-card operations belong here too (they are still `client.from('cards')` calls, just driven by deck logic). Reuse `CardDbRow` for deck-card rows.

**Files:**

- Create: `src/lib/supabase/queries/decks.ts`

**Interfaces:**

- Consumes: `CardDbRow` from `@/lib/card/db/cardRow`.
- Produces (exact signatures used in Tasks 7–8):
  - Row types exported: `DeckDbRow`, `FolderDbRow`.
  - `fetchDeckRows(userId: string): Promise<DeckDbRow[]>`
  - `fetchDeckRowById(deckId: string): Promise<DeckDbRow | null>`
  - `insertDeckRow(payload: Record<string, unknown>): Promise<void>`
  - `updateDeckRow(ownerId: string, deckId: string, payload: Record<string, unknown>): Promise<void>`
  - `deleteDeckRow(ownerId: string, deckId: string): Promise<void>`
  - `unassignDeckCardRows(deckId: string): Promise<void>`
  - `fetchDeckCardTagRows(deckIds: string[]): Promise<Array<{ deck_id: string; scryfall_id: string; tags: string[] | null }>>`
  - `fetchDeckCardRows(deckId: string): Promise<CardDbRow[]>`
  - `insertDeckCardRows(rows: Record<string, unknown>[]): Promise<void>`
  - `deleteDeckCardRowById(rowId: string): Promise<void>`
  - `updateDeckCardRowById(rowId: string, payload: Record<string, unknown>): Promise<void>`
  - `fetchFolderRows(userId: string): Promise<FolderDbRow[]>`
  - `insertFolderRow(payload: Record<string, unknown>): Promise<void>`
  - `updateFolderRow(ownerId: string, folderId: string, payload: Record<string, unknown>): Promise<void>`
  - `deleteFolderRow(ownerId: string, folderId: string): Promise<void>`

- [ ] **Step 1: Write `src/lib/supabase/queries/decks.ts`**

```ts
import { createClient } from '@/lib/supabase/client';
import type { CardDbRow } from '@/lib/card/db/cardRow';

/**
 * Raw Supabase access for `decks`, `deck_folders`, and deck-scoped `cards`
 * rows. ONLY place that issues these client.from(...) calls; domain mapping
 * (row <-> DeckMeta/FolderMeta/CardEntry) lives in deck/db.
 */

export type DeckDbRow = {
	id: string;
	owner_id: string;
	name: string;
	format: string | null;
	description: string | null;
	folder_id: string | null;
	cover_art_url: string | null;
	created_at: string;
	updated_at: string;
};

export type FolderDbRow = {
	id: string;
	owner_id: string;
	parent_id: string | null;
	name: string;
	position: number;
	created_at: string;
	updated_at: string;
};

// --- decks table ---

export async function fetchDeckRows(userId: string): Promise<DeckDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('decks')
		.select('*')
		.eq('owner_id', userId)
		.order('updated_at', { ascending: false });
	if (error) throw new Error(`[queries/decks] fetchDeckRows error: ${error.message}`);
	return data as DeckDbRow[];
}

export async function fetchDeckRowById(deckId: string): Promise<DeckDbRow | null> {
	const supabase = createClient();
	const { data, error } = await supabase.from('decks').select('*').eq('id', deckId).maybeSingle();
	if (error) throw new Error(`[queries/decks] fetchDeckRowById error: ${error.message}`);
	return (data as DeckDbRow | null) ?? null;
}

export async function insertDeckRow(payload: Record<string, unknown>): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').insert(payload);
	if (error) throw new Error(`[queries/decks] insertDeckRow error: ${error.message}`);
}

export async function updateDeckRow(
	ownerId: string,
	deckId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('decks')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', deckId);
	if (error) throw new Error(`[queries/decks] updateDeckRow error: ${error.message}`);
}

export async function deleteDeckRow(ownerId: string, deckId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('decks').delete().eq('owner_id', ownerId).eq('id', deckId);
	if (error) throw new Error(`[queries/decks] deleteDeckRow error: ${error.message}`);
}

// --- deck-scoped cards table ---

export async function unassignDeckCardRows(deckId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('cards')
		.update({ deck_id: null })
		.eq('deck_id', deckId)
		.not('owner_id', 'is', null);
	if (error) throw new Error(`[queries/decks] unassignDeckCardRows error: ${error.message}`);
}

export async function fetchDeckCardTagRows(
	deckIds: string[]
): Promise<Array<{ deck_id: string; scryfall_id: string; tags: string[] | null }>> {
	if (deckIds.length === 0) return [];
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('deck_id, scryfall_id, tags')
		.in('deck_id', deckIds);
	if (error) throw new Error(`[queries/decks] fetchDeckCardTagRows error: ${error.message}`);
	return data as Array<{ deck_id: string; scryfall_id: string; tags: string[] | null }>;
}

export async function fetchDeckCardRows(deckId: string): Promise<CardDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('cards')
		.select('*')
		.eq('deck_id', deckId)
		.order('date_added', { ascending: true });
	if (error) throw new Error(`[queries/decks] fetchDeckCardRows error: ${error.message}`);
	return data as CardDbRow[];
}

export async function insertDeckCardRows(rows: Record<string, unknown>[]): Promise<void> {
	if (rows.length === 0) return;
	const supabase = createClient();
	const { error } = await supabase.from('cards').insert(rows);
	if (error) throw new Error(`[queries/decks] insertDeckCardRows error: ${error.message}`);
}

export async function deleteDeckCardRowById(rowId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').delete().eq('id', rowId);
	if (error) throw new Error(`[queries/decks] deleteDeckCardRowById error: ${error.message}`);
}

export async function updateDeckCardRowById(
	rowId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('cards').update(payload).eq('id', rowId);
	if (error) throw new Error(`[queries/decks] updateDeckCardRowById error: ${error.message}`);
}

// --- deck_folders table ---

export async function fetchFolderRows(userId: string): Promise<FolderDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('deck_folders')
		.select('*')
		.eq('owner_id', userId)
		.order('position', { ascending: true });
	if (error) throw new Error(`[queries/decks] fetchFolderRows error: ${error.message}`);
	return data as FolderDbRow[];
}

export async function insertFolderRow(payload: Record<string, unknown>): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('deck_folders').insert(payload);
	if (error) throw new Error(`[queries/decks] insertFolderRow error: ${error.message}`);
}

export async function updateFolderRow(
	ownerId: string,
	folderId: string,
	payload: Record<string, unknown>
): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('deck_folders')
		.update(payload)
		.eq('owner_id', ownerId)
		.eq('id', folderId);
	if (error) throw new Error(`[queries/decks] updateFolderRow error: ${error.message}`);
}

export async function deleteFolderRow(ownerId: string, folderId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('deck_folders')
		.delete()
		.eq('owner_id', ownerId)
		.eq('id', folderId);
	if (error) throw new Error(`[queries/decks] deleteFolderRow error: ${error.message}`);
}
```

- [ ] **Step 2: Run the check gate**

Run: `npm run check`
Expected: exit 0 (compiles standalone, not yet imported). Fix formatting if needed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/decks.ts
git commit -m "refactor(supabase): add decks/folders queries layer (rows only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Rewire `deck/db/decks.ts` to the decks queries layer

**Files:**

- Modify: `src/lib/deck/db/decks.ts` (rewrite body; keep `rowToDeckMeta` mapping + all public signatures; import `DeckDbRow` from the queries layer instead of redeclaring it)

**Interfaces:**

- Consumes (from Task 6): `DeckDbRow`, `fetchDeckRows`, `fetchDeckRowById`, `insertDeckRow`, `updateDeckRow`, `deleteDeckRow`, `unassignDeckCardRows`, `fetchDeckCardTagRows`, `fetchDeckCardRows`, `insertDeckCardRows`, `deleteDeckCardRowById`, `updateDeckCardRowById` from `@/lib/supabase/queries/decks`. Also `cardEntryToRow`, `rowToCardEntry` from `@/lib/card/db/cardRow`.
- Produces: unchanged public API — `fetchDecks`, `fetchDeckMetaById`, `insertDeck`, `updateDeckMeta`, `moveDeckToFolder`, `deleteDeck`, `unassignCollectionCopiesFromDeck`, `fetchDeckCardEntries`, `fetchDeckCards`, `insertDeckCard`, `insertDeckCards`, `deleteDeckCard`, `updateDeckCard`.

- [ ] **Step 1: Rewrite `src/lib/deck/db/decks.ts`**

```ts
import type { CardEntry } from '@/types/cards';
import type { DeckMeta } from '@/types/decks';
import { type CardDbRow, rowToCardEntry, cardEntryToRow } from '@/lib/card/db/cardRow';
import {
	type DeckDbRow,
	fetchDeckRows,
	fetchDeckRowById,
	insertDeckRow,
	updateDeckRow,
	deleteDeckRow,
	unassignDeckCardRows,
	fetchDeckCardTagRows,
	fetchDeckCardRows,
	insertDeckCardRows,
	deleteDeckCardRowById,
	updateDeckCardRowById,
} from '@/lib/supabase/queries/decks';

function rowToDeckMeta(row: DeckDbRow): DeckMeta {
	return {
		id: row.id,
		ownerId: row.owner_id,
		name: row.name,
		format: (row.format as DeckMeta['format']) ?? null,
		description: row.description,
		folderId: row.folder_id ?? null,
		coverArtUrl: row.cover_art_url ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// --- Deck CRUD ---

export async function fetchDecks(userId: string): Promise<DeckMeta[]> {
	return (await fetchDeckRows(userId)).map(rowToDeckMeta);
}

/**
 * Fetch a deck by id WITHOUT an owner filter — used by the public read-only
 * view. Relies on the public SELECT policy. Returns null if absent.
 */
export async function fetchDeckMetaById(deckId: string): Promise<DeckMeta | null> {
	const row = await fetchDeckRowById(deckId);
	return row ? rowToDeckMeta(row) : null;
}

export async function insertDeck(userId: string, deck: DeckMeta): Promise<void> {
	await insertDeckRow({
		id: deck.id,
		owner_id: userId,
		name: deck.name,
		format: deck.format,
		description: deck.description,
		folder_id: deck.folderId ?? null,
		cover_art_url: deck.coverArtUrl ?? null,
		created_at: deck.createdAt,
		updated_at: deck.updatedAt,
	});
}

export async function updateDeckMeta(
	userId: string,
	deckId: string,
	updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl'>>
): Promise<void> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.format !== undefined) payload.format = updates.format;
	if (updates.description !== undefined) payload.description = updates.description;
	if (updates.coverArtUrl !== undefined) payload.cover_art_url = updates.coverArtUrl;
	await updateDeckRow(userId, deckId, payload);
}

export async function moveDeckToFolder(
	userId: string,
	deckId: string,
	folderId: string | null
): Promise<void> {
	await updateDeckRow(userId, deckId, {
		folder_id: folderId,
		updated_at: new Date().toISOString(),
	});
}

export async function deleteDeck(
	userId: string,
	deckId: string,
	deleteCollectionCopies = false
): Promise<void> {
	if (!deleteCollectionCopies) {
		await unassignCollectionCopiesFromDeck(userId, deckId);
	}
	await deleteDeckRow(userId, deckId);
}

export async function unassignCollectionCopiesFromDeck(
	userId: string,
	deckId: string
): Promise<void> {
	// userId is unused by the query (RLS scopes to owner); kept for call-site clarity.
	void userId;
	await unassignDeckCardRows(deckId);
}

/** Fetch scryfall_id + tags for each card in the given decks (single query). */
export async function fetchDeckCardEntries(
	deckIds: string[]
): Promise<Record<string, Array<{ scryfallId: string; tags: string[] | null }>>> {
	const rows = await fetchDeckCardTagRows(deckIds);
	const result: Record<string, Array<{ scryfallId: string; tags: string[] | null }>> = {};
	for (const row of rows) {
		if (!result[row.deck_id]) result[row.deck_id] = [];
		result[row.deck_id].push({ scryfallId: row.scryfall_id, tags: row.tags });
	}
	return result;
}

// --- Deck card operations (cards table with deck_id) ---

export async function fetchDeckCards(
	deckId: string
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const rows = await fetchDeckCardRows(deckId);
	return rows.map((row: CardDbRow) => ({
		scryfallId: row.scryfall_id,
		entry: rowToCardEntry(row, { includeOwnerId: true }),
	}));
}

export async function insertDeckCard(
	deckId: string,
	scryfallId: string,
	entry: CardEntry
): Promise<void> {
	await insertDeckCardRows([{ ...cardEntryToRow(scryfallId, entry), deck_id: deckId }]);
}

export async function insertDeckCards(
	deckId: string,
	cards: Array<{ scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (cards.length === 0) return;
	await insertDeckCardRows(
		cards.map(({ scryfallId, entry }) => ({
			...cardEntryToRow(scryfallId, entry),
			deck_id: deckId,
		}))
	);
}

export async function deleteDeckCard(rowId: string): Promise<void> {
	await deleteDeckCardRowById(rowId);
}

export async function updateDeckCard(
	rowId: string,
	updates: {
		scryfall_id?: string;
		tags?: string[];
		owner_id?: string | null;
		proxy?: boolean | null;
		is_foil?: boolean | null;
		foil_type?: string | null;
		condition?: string | null;
		language?: string | null;
		purchase_price?: string | null;
		wishlist?: boolean;
		deck_id?: string | null;
	}
): Promise<void> {
	await updateDeckCardRowById(rowId, updates);
}
```

- [ ] **Step 2: Confirm no client usage remains**

Run:

```bash
grep -n "createClient\|\.from(" src/lib/deck/db/decks.ts
```

Expected: no output.

- [ ] **Step 3: Run the check gate**

Run: `npm run check`
Expected: exit 0. Note: the `void userId;` line preserves the existing parameter without an unused-var lint error; if ESLint still flags it, prefix the param with `_` instead and remove the `void` line. Re-run check.

- [ ] **Step 4: Commit**

```bash
git add src/lib/deck/db/decks.ts
git commit -m "refactor(deck): route decks db through supabase/queries/decks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Rewire `deck/db/folders.ts` to the decks queries layer

**Files:**

- Modify: `src/lib/deck/db/folders.ts` (rewrite body; keep `rowToFolderMeta`; import `FolderDbRow` from queries layer)

**Interfaces:**

- Consumes (from Task 6): `FolderDbRow`, `fetchFolderRows`, `insertFolderRow`, `updateFolderRow`, `deleteFolderRow` from `@/lib/supabase/queries/decks`.
- Produces: unchanged `fetchFolders`, `insertFolder`, `updateFolder`, `deleteFolder`.

- [ ] **Step 1: Rewrite `src/lib/deck/db/folders.ts`**

```ts
import type { FolderMeta } from '@/types/decks';
import {
	type FolderDbRow,
	fetchFolderRows,
	insertFolderRow,
	updateFolderRow,
	deleteFolderRow,
} from '@/lib/supabase/queries/decks';

function rowToFolderMeta(row: FolderDbRow): FolderMeta {
	return {
		id: row.id,
		parentId: row.parent_id,
		name: row.name,
		position: row.position,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function fetchFolders(userId: string): Promise<FolderMeta[]> {
	return (await fetchFolderRows(userId)).map(rowToFolderMeta);
}

export async function insertFolder(userId: string, folder: FolderMeta): Promise<void> {
	await insertFolderRow({
		id: folder.id,
		owner_id: userId,
		parent_id: folder.parentId,
		name: folder.name,
		position: folder.position,
		created_at: folder.createdAt,
		updated_at: folder.updatedAt,
	});
}

export async function updateFolder(
	userId: string,
	folderId: string,
	updates: Partial<Pick<FolderMeta, 'name' | 'parentId' | 'position'>>
): Promise<void> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.parentId !== undefined) payload.parent_id = updates.parentId;
	if (updates.position !== undefined) payload.position = updates.position;
	await updateFolderRow(userId, folderId, payload);
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
	await deleteFolderRow(userId, folderId);
}
```

- [ ] **Step 2: Confirm no client usage remains**

Run:

```bash
grep -n "createClient\|\.from(" src/lib/deck/db/folders.ts
```

Expected: no output.

- [ ] **Step 3: Run the check gate**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/deck/db/folders.ts
git commit -m "refactor(deck): route folders db through supabase/queries/decks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Create the `custom_cards` queries layer (rows + Supabase-shaped query)

Move the entire Supabase-coupled query logic (`queryCustomCards`'s filter builder, `getCustomCardSources`, `getCustomCardSourcesWithCount`, the server-side `getCustomCardWithSource` two-step fetch, and the `CUSTOM_CARD_SELECT` constants) into `src/lib/supabase/queries/custom-cards.ts`, returning **rows**. The `CustomCardRow` / `CustomCardSourceRow` row types live here (they describe DB columns). Domain mapping (`rowToMpcCard`, `rowToMpcSource`, `toCustomCard`) and the `CustomCardQuery*` / `CustomCardPage` API types stay for Task 10 in `mpc/db/`.

Rationale: `queryCustomCards`'s filter builder uses Supabase operators (`.ilike`, `.overlaps`, `.gte`, `.not`) — that IS the client coupling, so it belongs in the queries layer. It returns raw `CustomCardRow[]` + `count`; the post-query color filtering (which operates on `MpcCard`) moves to the domain layer in Task 10.

**Files:**

- Create: `src/lib/supabase/queries/custom-cards.ts`

**Interfaces:**

- Consumes: nothing from feature modules (must stay domain-free — uses only `CardType` etc. as plain string types via local definition or import from `@/lib/mpc/types` ONLY for the filter type; see note). NOTE: `CustomCardQueryFilters` references `CardType` from `@/lib/mpc/types`. Importing a domain _type_ (not a value) is acceptable here because the filter shape is part of the query contract; the rule forbids domain _logic/values_ in the queries layer, and type-only imports carry no runtime coupling. Keep this the single domain-type import.
- Produces (exact signatures used in Task 10):
  - Row types: `CustomCardRow`, `CustomCardSourceRow`.
  - Constants: `CUSTOM_CARD_SELECT`, `CUSTOM_CARD_SOURCE_SELECT`.
  - Filter/query input types: `CustomCardQueryFilters`, `CustomCardRowQuery` (`{ sourceId?: string | null; page: number; pageSize: number; filters: CustomCardQueryFilters }`).
  - `fetchCustomCardSourceRows(): Promise<CustomCardSourceRow[]>`
  - `fetchCustomCardSourceRowsWithCounts(): Promise<{ sources: CustomCardSourceRow[]; countBySource: Map<string, number> }>`
  - `queryCustomCardRows(query: CustomCardRowQuery): Promise<{ rows: CustomCardRow[]; count: number }>`
  - `fetchCustomCardRowById(id: string): Promise<CustomCardRow | null>` (server client — **must live in a separate `custom-cards.server.ts`**, see note)
  - `fetchCustomCardSourceRowById(sourceId: string): Promise<CustomCardSourceRow | null>` (server client — separate file)

> **Server/client bundling note (learned during execution):** the two `…ById`
> functions use the SERVER client (`@/lib/supabase/server`, which imports
> `next/headers`). They MUST NOT live in the same file as the browser-client
> query functions: `mpc/db/custom-cards.ts` (consumed by the client component
> `search/page.tsx`) transitively imports the browser query file, so any
> `next/headers` import there breaks the client bundle (`tsc` passes but
> `npm run build` fails). Put the two `…ById` functions in
> `src/lib/supabase/queries/custom-cards.server.ts`, importing the shared row
> types + `CUSTOM_CARD_SELECT`/`CUSTOM_CARD_SOURCE_SELECT` from the sibling
> browser file. `mpc/db/custom-cards.server.ts` then imports them from
> `@/lib/supabase/queries/custom-cards.server`. The browser
> `queries/custom-cards.ts` contains ONLY the browser-client functions and never
> imports `@/lib/supabase/server`.

- [ ] **Step 1: Write `src/lib/supabase/queries/custom-cards.ts`** (browser-client functions only — do NOT include the `createServerClient` import or the two `…ById` functions here; those go in `custom-cards.server.ts` per the note above)

```ts
import { createClient } from '@/lib/supabase/client';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { CardType } from '@/lib/mpc/types';

/**
 * Raw Supabase access for `custom_cards` / `custom_card_sources`. ONLY place
 * that issues these client.from(...) calls. Returns DB rows; domain mapping
 * (row -> MpcCard/MpcSource) and post-query color filtering live in mpc/db.
 *
 * `CardType` is imported as a TYPE only (filter contract); no domain runtime
 * value or logic enters this layer.
 */

export interface CustomCardSourceRow {
	id: string;
	name: string;
	description: string | null;
	drive_folder_id: string | null;
	tags: string[];
}

export interface CustomCardRow {
	id: string;
	source_id: string | null;
	name: string;
	raw_name: string;
	display_name: string | null;
	image_drive_url: string | null;
	image_storage_path: string | null;
	oracle_id: string | null;
	source_type: import('@/lib/mpc/types').CardSourceType;
	is_public: boolean;
	created_by: string | null;
	card_type: CardType;
	language: string | null;
	tags: string[];
	set_code: string | null;
	collector_number: string | null;
	colors: string[] | null;
	color_identity: string[] | null;
	cmc: number | null;
	type_line: string | null;
	mana_cost: string | null;
	oracle_text: string | null;
	rarity: string | null;
	set_name: string | null;
	artist: string | null;
	drive_folder_path: string | null;
}

export const CUSTOM_CARD_SOURCE_SELECT = 'id, name, description, drive_folder_id, tags';

export const CUSTOM_CARD_SELECT =
	'id, source_id, name, raw_name, display_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, set_code, collector_number, colors, color_identity, cmc, type_line, mana_cost, oracle_text, rarity, set_name, artist, drive_folder_path';

export interface CustomCardQueryFilters {
	name?: string;
	colors?: string[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string[];
	set?: string;
	cmc?: string;
	rarities?: string[];
	oracleText?: string;
	mpcTagsMustHave?: string[];
	mpcTagsMustNotHave?: string[];
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
	oracleId?: string;
	cardTypes?: CardType[];
	order?: string;
	dir?: 'asc' | 'desc' | 'auto';
}

export interface CustomCardRowQuery {
	sourceId?: string | null;
	page: number;
	pageSize: number;
	filters: CustomCardQueryFilters;
}

export async function fetchCustomCardSourceRows(): Promise<CustomCardSourceRow[]> {
	const client = createClient();
	const { data, error } = await client
		.from('custom_card_sources')
		.select(CUSTOM_CARD_SOURCE_SELECT)
		.order('name');
	if (error) throw new Error(`Failed to load custom card sources: ${error.message}`);
	return data as CustomCardSourceRow[];
}

export async function fetchCustomCardSourceRowsWithCounts(): Promise<{
	sources: CustomCardSourceRow[];
	countBySource: Map<string, number>;
}> {
	const client = createClient();
	const [sourcesResult, cardsResult] = await Promise.all([
		client.from('custom_card_sources').select(CUSTOM_CARD_SOURCE_SELECT).order('name'),
		client.from('custom_cards').select('source_id').eq('is_public', true),
	]);
	if (sourcesResult.error)
		throw new Error(`Failed to load custom card sources: ${sourcesResult.error.message}`);
	if (cardsResult.error)
		throw new Error(`Failed to load custom card counts: ${cardsResult.error.message}`);

	const countBySource = new Map<string, number>();
	for (const row of cardsResult.data as { source_id: string }[]) {
		countBySource.set(row.source_id, (countBySource.get(row.source_id) ?? 0) + 1);
	}
	return { sources: sourcesResult.data as CustomCardSourceRow[], countBySource };
}

function parseCmcClause(raw: string): { op: string; value: number } | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	return { op: match[1] ?? ':', value: parseInt(match[2], 10) };
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- query builder: one conditional per optional filter
export async function queryCustomCardRows(
	query: CustomCardRowQuery
): Promise<{ rows: CustomCardRow[]; count: number; offset: number }> {
	const client = createClient();
	const { sourceId, page, pageSize, filters } = query;
	const offset = (page - 1) * pageSize;

	let q = client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT, { count: 'exact' })
		.eq('is_public', true);

	if (sourceId) q = q.eq('source_id', sourceId);
	if (filters.name) q = q.ilike('name', `%${filters.name}%`);
	if (filters.type?.length) {
		q = filters.type.reduce((acc, t) => acc.ilike('type_line', `%${t}%`), q);
	}
	if (filters.oracleText) q = q.ilike('oracle_text', `%${filters.oracleText}%`);
	if (filters.set) q = q.eq('set_code', filters.set);
	if (filters.rarities?.length) q = q.in('rarity', filters.rarities);
	if (filters.cardTypes?.length) q = q.in('card_type', filters.cardTypes);
	if (filters.mpcTagsMustHave?.length) q = q.overlaps('tags', filters.mpcTagsMustHave);
	if (filters.mpcTagsMustNotHave?.length)
		q = filters.mpcTagsMustNotHave.reduce((acc, tag) => acc.not('tags', 'cs', `{${tag}}`), q);
	if (filters.oracleIdFilter === 'defined') q = q.not('oracle_id', 'is', null);
	else if (filters.oracleIdFilter === 'undefined') q = q.is('oracle_id', null);
	if (filters.oracleId) q = q.eq('oracle_id', filters.oracleId);
	if (filters.colors?.length && filters.colorMatch === 'include')
		q = q.overlaps('colors', filters.colors);

	const cmcClause = parseCmcClause(filters.cmc ?? '');
	if (cmcClause) {
		const { op, value } = cmcClause;
		const cmcOps: Record<string, (col: string, val: number) => typeof q> = {
			'>=': (col, val) => q.gte(col, val),
			'<=': (col, val) => q.lte(col, val),
			'>': (col, val) => q.gt(col, val),
			'<': (col, val) => q.lt(col, val),
		};
		q = (cmcOps[op] ?? ((col, val) => q.eq(col, val)))('cmc', value);
	}

	let sortColumn = 'name';
	if (filters.order === 'cmc') sortColumn = 'cmc';
	else if (filters.order === 'rarity') sortColumn = 'rarity';
	const ascending = filters.dir !== 'desc';
	q = q.order(sortColumn, { ascending }).range(offset, offset + pageSize - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`Failed to load custom cards: ${error.message}`);
	return { rows: data as CustomCardRow[], count: count ?? 0, offset };
}

export async function fetchCustomCardRowById(id: string): Promise<CustomCardRow | null> {
	const client = await createServerClient();
	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.eq('id', id)
		.single();
	if (error || !data) return null;
	return data as CustomCardRow;
}

export async function fetchCustomCardSourceRowById(
	sourceId: string
): Promise<CustomCardSourceRow | null> {
	const client = await createServerClient();
	const { data } = await client
		.from('custom_card_sources')
		.select(CUSTOM_CARD_SOURCE_SELECT)
		.eq('id', sourceId)
		.single();
	return (data as CustomCardSourceRow | null) ?? null;
}
```

- [ ] **Step 2: Run the check gate**

Run: `npm run check`
Expected: exit 0 (compiles standalone). Note: `import('@/lib/mpc/types').CardSourceType` inline-type is used to avoid a second top-level import; if ESLint prefers a named import, add `import type { CardType, CardSourceType } from '@/lib/mpc/types'` and use `CardSourceType` directly. Re-run.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/custom-cards.ts
git commit -m "refactor(supabase): add custom_cards queries layer (rows only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Create `mpc/db/custom-cards.ts` + `.server.ts` (domain mapping) and delete the old supabase files

Move domain mapping into the mpc feature. `mpc/db/custom-cards.ts` keeps `rowToMpcCard`, `rowToMpcSource`, `resolveImageUrl`, the public API types (`MpcSourceWithCount`, `CustomCardQuery`, `CustomCardPage`), and orchestrates: call `queryCustomCardRows` → map rows → apply post-query color filtering. `mpc/db/custom-cards.server.ts` keeps `getCustomCardWithSource` orchestration over the server row fetchers. Then delete the old `supabase/custom-cards.ts` + `supabase/custom-cards.server.ts` and repoint all importers.

**Files:**

- Create: `src/lib/mpc/db/custom-cards.ts`
- Create: `src/lib/mpc/db/custom-cards.server.ts`
- Delete: `src/lib/supabase/custom-cards.ts`, `src/lib/supabase/custom-cards.server.ts`
- Modify importers: `src/lib/mpc/hooks/useCustomCards.ts`, `src/lib/mpc/hooks/useCustomCardPrints.ts`, `src/lib/search/components/filters/CustomSourceFilter/CustomSourceFilter.tsx`, `src/lib/search/components/FilterModal/FilterModal.tsx`, `src/app/search/page.tsx`, `src/app/card/[id]/page.tsx`

**Interfaces:**

- Consumes (from Task 9): `queryCustomCardRows`, `fetchCustomCardSourceRows`, `fetchCustomCardSourceRowsWithCounts`, `fetchCustomCardRowById`, `fetchCustomCardSourceRowById`, types `CustomCardRow`, `CustomCardSourceRow`, `CustomCardQueryFilters` from `@/lib/supabase/queries/custom-cards`. Also `toCustomCard` from `@/lib/mpc/adapter`, types from `@/lib/mpc/types`.
- Produces (must match the OLD exported names so importers only change the path): `rowToMpcSource`, `rowToMpcCard`, `getCustomCardSources`, `getCustomCardSourcesWithCount`, `queryCustomCards`, types `MpcSourceWithCount`, `CustomCardQuery`, `CustomCardPage`, `CustomCardQueryFilters` (re-exported); and from `.server.ts`: `getCustomCardWithSource`.

- [ ] **Step 1: Write `src/lib/mpc/db/custom-cards.ts`**

```ts
import type { CardType, MpcCard, MpcSource } from '@/lib/mpc/types';
import {
	type CustomCardRow,
	type CustomCardSourceRow,
	type CustomCardQueryFilters,
	fetchCustomCardSourceRows,
	fetchCustomCardSourceRowsWithCounts,
	queryCustomCardRows,
} from '@/lib/supabase/queries/custom-cards';

export type { CustomCardQueryFilters };
export type { CardType };

function resolveImageUrl(row: CustomCardRow): string {
	if (row.image_storage_path) {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
		return `${supabaseUrl}/storage/v1/object/public/custom-cards/${row.image_storage_path}`;
	}
	return row.image_drive_url ?? '';
}

export function rowToMpcSource(row: CustomCardSourceRow): MpcSource {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? undefined,
		isBuiltIn: true,
		tags: row.tags,
		driveFolderId: row.drive_folder_id,
	};
}

export function rowToMpcCard(row: CustomCardRow): MpcCard {
	return {
		id: row.id.startsWith('mpc:') ? row.id.slice(4) : row.id,
		name: row.name,
		rawName: row.raw_name,
		displayName: row.display_name ?? null,
		sourceId: row.source_id,
		imageUrl: resolveImageUrl(row),
		isCustom: true,
		oracleId: row.oracle_id ?? undefined,
		sourceType: row.source_type,
		isPublic: row.is_public,
		createdBy: row.created_by ?? undefined,
		cardType: row.card_type ?? 'card',
		language: row.language ?? null,
		tags: row.tags ?? [],
		setCode: row.set_code ?? null,
		collectorNumber: row.collector_number ?? null,
		colors: row.colors ?? undefined,
		colorIdentity: row.color_identity ?? undefined,
		cmc: row.cmc ?? undefined,
		typeLine: row.type_line ?? undefined,
		manaCost: row.mana_cost ?? undefined,
		oracleText: row.oracle_text ?? undefined,
		rarity: row.rarity ?? undefined,
		setName: row.set_name ?? undefined,
		artist: row.artist ?? undefined,
		driveFolderPath: row.drive_folder_path ?? null,
	};
}

export async function getCustomCardSources(): Promise<MpcSource[]> {
	return (await fetchCustomCardSourceRows()).map(rowToMpcSource);
}

export interface MpcSourceWithCount extends MpcSource {
	cardCount: number;
}

export async function getCustomCardSourcesWithCount(): Promise<MpcSourceWithCount[]> {
	const { sources, countBySource } = await fetchCustomCardSourceRowsWithCounts();
	return sources
		.map((row) => ({ ...rowToMpcSource(row), cardCount: countBySource.get(row.id) ?? 0 }))
		.filter((s) => s.cardCount > 0);
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

function colorMatchesExact(c: MpcCard, sel: string[]): boolean {
	return (
		c.colors !== undefined &&
		c.colors.length === sel.length &&
		sel.every((col) => c.colors!.includes(col))
	);
}

function colorMatchesAtMost(c: MpcCard, sel: string[]): boolean {
	return c.colors === undefined || c.colors.every((col) => sel.includes(col));
}

export async function queryCustomCards(query: CustomCardQuery): Promise<CustomCardPage> {
	const { rows: rawRows, count, offset } = await queryCustomCardRows(query);
	let rows = rawRows.map(rowToMpcCard);
	const rawPageCount = rows.length; // capture before post-filter

	// Post-query color filtering for exact/atMost (Supabase lacks native exact array equality)
	const { filters } = query;
	if (filters.colors?.length) {
		const sel = filters.colors;
		if (filters.colorMatch === 'exact') rows = rows.filter((c) => colorMatchesExact(c, sel));
		else if (filters.colorMatch === 'atMost') rows = rows.filter((c) => colorMatchesAtMost(c, sel));
	}

	return { cards: rows, hasMore: offset + rawPageCount < count, total: count };
}
```

- [ ] **Step 2: Write `src/lib/mpc/db/custom-cards.server.ts`**

```ts
import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';
import {
	fetchCustomCardRowById,
	fetchCustomCardSourceRowById,
} from '@/lib/supabase/queries/custom-cards';
import { rowToMpcCard, rowToMpcSource } from './custom-cards';

export async function getCustomCardWithSource(id: string): Promise<CustomCard | null> {
	const row = await fetchCustomCardRowById(id);
	if (!row) return null;

	let source: MpcSource = {
		id: row.source_id ?? 'unknown',
		name: row.source_id ?? 'Custom',
		isBuiltIn: false,
		tags: [],
		driveFolderId: null,
	};

	if (row.source_id) {
		const sourceRow = await fetchCustomCardSourceRowById(row.source_id);
		if (sourceRow) source = rowToMpcSource(sourceRow);
	}

	return toCustomCard(rowToMpcCard(row), source);
}
```

- [ ] **Step 3: Delete the old supabase files**

```bash
git rm src/lib/supabase/custom-cards.ts src/lib/supabase/custom-cards.server.ts
```

- [ ] **Step 4: Repoint all importers**

Run the sweep, then verify:

```bash
grep -rl "@/lib/supabase/custom-cards.server" src | xargs -r sed -i "s#@/lib/supabase/custom-cards.server#@/lib/mpc/db/custom-cards.server#g"
grep -rl "@/lib/supabase/custom-cards" src | xargs -r sed -i "s#@/lib/supabase/custom-cards#@/lib/mpc/db/custom-cards#g"
grep -rn "supabase/custom-cards" src
```

Expected: the last grep prints nothing.

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: exit 0. If a `.server` import got rewritten before the non-server one and produced a wrong path, fix it manually (the `.server` sweep runs first to avoid the prefix collision — verify both paths resolved).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(mpc): move custom-cards db into mpc/db, split client into supabase/queries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Create auth helpers and repoint `src/app/` call sites

Centralize Supabase auth usage. Server gating (`getUser()`) → `getCurrentUser()` in `supabase/auth/auth-server.ts`. Client OTP (`signInWithOtp` / `verifyOtp`) → `supabase/auth/auth-client.ts`. Repoint `src/app/auth/layout.tsx`, `src/app/auth/confirm/route.ts`, `src/app/collection/layout.tsx`, `src/app/decks/page.tsx`, `src/app/auth/login/LoginForm.tsx`.

**Files:**

- Create: `src/lib/supabase/auth/auth-server.ts`
- Create: `src/lib/supabase/auth/auth-client.ts`
- Modify: `src/app/auth/layout.tsx`, `src/app/auth/confirm/route.ts`, `src/app/collection/layout.tsx`, `src/app/decks/page.tsx`, `src/app/auth/login/LoginForm.tsx`

**Interfaces:**

- Produces:
  - `auth-server.ts`: `getCurrentUser(): Promise<User | null>`, `exchangeCodeForSession(code: string): Promise<{ error: AuthError | null }>`, `verifyEmailOtp(params: { type: EmailOtpType; token_hash: string }): Promise<{ error: AuthError | null }>`
  - `auth-client.ts`: `signInWithEmailOtp(email: string, emailRedirectTo: string): Promise<{ error: AuthError | null }>`, `verifyEmailOtpClient(email: string, token: string): Promise<{ error: AuthError | null }>`

- [ ] **Step 1: Write `src/lib/supabase/auth/auth-server.ts`**

```ts
import type { AuthError, EmailOtpType, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Server-side current user (RLS-scoped). Returns null when anonymous. */
export async function getCurrentUser(): Promise<User | null> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	return user ?? null;
}

export async function exchangeCodeForSession(code: string): Promise<{ error: AuthError | null }> {
	const supabase = await createClient();
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	return { error };
}

export async function verifyEmailOtp(params: {
	type: EmailOtpType;
	token_hash: string;
}): Promise<{ error: AuthError | null }> {
	const supabase = await createClient();
	const { error } = await supabase.auth.verifyOtp(params);
	return { error };
}
```

- [ ] **Step 2: Write `src/lib/supabase/auth/auth-client.ts`**

```ts
'use client';

import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export async function signInWithEmailOtp(
	email: string,
	emailRedirectTo: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
	return { error };
}

export async function verifyEmailOtpClient(
	email: string,
	token: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
	return { error };
}
```

- [ ] **Step 3: Rewrite `src/app/auth/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const user = await getCurrentUser();
	if (user) {
		redirect('/collection');
	}
	return <>{children}</>;
}
```

- [ ] **Step 4: Rewrite `src/app/collection/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/collection` is a shortcut to the canonical shareable URL. Logged-in users are
// sent to /users/<id>/collection; anonymous users to login. The owner view
// component (collection/page.tsx) is reused by the canonical page, not this route.
export default async function CollectionLayout() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/collection`);
}
```

- [ ] **Step 5: Rewrite `src/app/decks/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

// `/decks` is a shortcut to the canonical shareable URL /users/<id>/decks.
// Anonymous visitors are sent to login. `/decks/[id]` stays public via the
// un-gated decks layout.
export default async function DecksPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/decks`);
}
```

- [ ] **Step 6: Rewrite `src/app/auth/confirm/route.ts`**

```ts
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForSession, verifyEmailOtp } from '@/lib/supabase/auth/auth-server';

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const token_hash = searchParams.get('token_hash');
	const type = searchParams.get('type') as EmailOtpType | null;
	const code = searchParams.get('code');

	// PKCE flow (Supabase local / newer versions)
	if (code) {
		const { error } = await exchangeCodeForSession(code);
		if (!error) {
			return NextResponse.redirect(new URL('/collection', request.url));
		}
	}

	// OTP flow (token_hash)
	if (token_hash && type) {
		const { error } = await verifyEmailOtp({ type, token_hash });
		if (!error) {
			return NextResponse.redirect(new URL('/collection', request.url));
		}
	}

	return NextResponse.redirect(new URL('/auth/error?error_code=confirmation_failed', request.url));
}
```

- [ ] **Step 7: Update `src/app/auth/login/LoginForm.tsx`**

Replace the `createClient` import and its two inline auth calls. Change the import line:

```tsx
import { createClient } from '@/lib/supabase/client';
```

to:

```tsx
import { signInWithEmailOtp, verifyEmailOtpClient } from '@/lib/supabase/auth/auth-client';
```

In `handleSubmitEmail`, replace:

```tsx
const supabase = createClient();
const { error } = await supabase.auth.signInWithOtp({
	email,
	options: {
		emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
	},
});
```

with:

```tsx
const { error } = await signInWithEmailOtp(
	email,
	`${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`
);
```

In `handleSubmitOtp`, replace:

```tsx
const supabase = createClient();
const { error } = await supabase.auth.verifyOtp({
	email,
	token: otp,
	type: 'email',
});
```

with:

```tsx
const { error } = await verifyEmailOtpClient(email, otp);
```

- [ ] **Step 8: Verify no Supabase client/auth usage remains in src/app**

Run:

```bash
grep -rn "@/lib/supabase/client\|@/lib/supabase/server\|\.auth\." src/app
```

Expected: no output.

- [ ] **Step 9: Run the check gate**

Run: `npm run check`
Expected: exit 0. If `User` / `AuthError` / `EmailOtpType` type imports from `@supabase/supabase-js` resolve wrong, confirm the package is a dependency (it is — used by the SSR helpers).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(supabase): centralize auth in supabase/auth helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Verify the single-folder invariant holds across the whole codebase

This is the proof that the reorg achieved its goal. No code change unless the grep finds a leak.

**Files:**

- None (verification task). If a leak is found, fix it in the file shown and re-run.

- [ ] **Step 1: Assert no Supabase client usage outside `src/lib/supabase/` (except the framework-imposed proxy)**

Run:

```bash
grep -rn "createClient\|\.from(\|\.auth\.\|\.storage\.\|\.rpc(" src \
  | grep -v "src/lib/supabase/" \
  | grep -v "src/proxy.ts" \
  | grep -vE "Array\.from|Object\.from|\.from\([0-9]"
```

Expected: no output. Any line printed is a leak — open that file and route the call through the appropriate `supabase/queries/*` or `supabase/auth/*` helper (creating a new helper if needed), then re-run this step. (Known acceptable matches that may still appear and must be inspected: none expected — `card/components/CardListGrid` and `card/components/DeckBadge` flagged earlier were `Array.from` false positives, confirmed excluded by the filter.)

- [ ] **Step 2: Assert no stale module paths remain**

Run:

```bash
grep -rn "@/components/WishlistIcon\|lib/card/components/LocalizedCardThumb\|@/lib/supabase/custom-cards" src
```

Expected: no output.

- [ ] **Step 3: Full build sanity check**

Run: `npm run build`
Expected: build completes successfully (Next.js compiles all routes). This catches any runtime-only import or server/client boundary issue that `tsc` alone might miss (e.g. a server-only helper imported into a client component).

- [ ] **Step 4: Commit (only if Step 1/2 required a fix; otherwise skip)**

```bash
git add -A
git commit -m "refactor(supabase): close remaining client-usage leaks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Document the functional-domain vs external-integration rule

Make the rule that drove this reorg explicit so future code lands correctly.

**Files:**

- Modify: `docs/feature-modules.md` (add a section)
- Modify: `AGENTS.md` (add one bullet under "Common Pitfalls" + cross-reference)

**Interfaces:** none (documentation).

- [ ] **Step 1: Append a section to `docs/feature-modules.md`**

Add, after the "Where Things Do NOT Go" section:

```markdown
## Functional Domains vs. External-Integration Modules

`src/lib/` holds two kinds of modules:

- **Functional (domain) modules** — `card`, `collection`, `deck`, `wishlist`,
  `import`, `mpc`, `edhrec`, `pdf`, `mtg`, `search`. They own business logic and
  domain types. Each has its own `db/` that maps `row ↔ domain type`.
- **External-integration modules** — `supabase`, `scryfall`. They own ALL
  communication with one external service and expose it to the rest of the app.
  They contain **no business logic and no domain types** in their query layer.

### The Supabase boundary rule

`src/lib/supabase/` is the **single place** that may touch the Supabase client
(`createClient`, `.from()`, `.auth.*`, `.storage.*`, `.rpc()`). The goal is a
migration-friendly seam: swapping backends should rewrite only this folder.
```

src/lib/supabase/
client.ts / server.ts # client factories
queries/ # ONLY place issuing client.from(...) — returns/accepts ROWS
cards.ts # cards + public_collection_cards
decks.ts # decks + deck_folders + deck-scoped cards
custom-cards.ts # custom_cards + custom_card_sources
auth/ # ONLY place issuing client.auth.\* — returns plain results
auth-server.ts # getCurrentUser, exchangeCodeForSession, verifyEmailOtp
auth-client.ts # signInWithEmailOtp, verifyEmailOtpClient
sync-queue.ts / ... # generic offline infra

```

A domain `db/` (e.g. `collection/db/collection.ts`) imports from
`supabase/queries/*` and does `row → CardEntry` mapping. It must NOT call
`createClient` or `.from()` directly.

**Row types** (`CardDbRow`, `DeckDbRow`, …) are the shared contract between the
two layers. `CardDbRow` lives in `card/db/cardRow.ts`; table-specific row types
live alongside their queries in `supabase/queries/*`.

**Type-only exception:** the queries layer may import a domain *type* (e.g.
`CardType`) when it is part of a filter/query contract — type-only imports carry
no runtime coupling. It must never import domain *values* or *logic*.

The only allowed Supabase-client caller outside this folder is `src/proxy.ts`
(Next.js middleware entry, framework-imposed), which delegates to
`supabase/middleware.ts`.

> `scryfall` follows the same spirit but is broader: it also owns React hooks and
> presentational components (mana symbols) coupled to Scryfall data. The "no
> domain logic" constraint applies to its fetch/query layer; reuse beyond that is
> by design.
```

- [ ] **Step 2: Add a pitfall bullet to `AGENTS.md`**

Under "## Common Pitfalls", add:

```markdown
- **Never call the Supabase client outside `src/lib/supabase/`.** All `createClient` / `.from()` / `.auth.*` calls live in `supabase/queries/*` (data) or `supabase/auth/*` (auth) and return/accept ROWS only; domain `db/` modules map rows ↔ domain types. See `docs/feature-modules.md` § "Functional Domains vs. External-Integration Modules". (`src/proxy.ts` is the sole framework-imposed exception.)
```

- [ ] **Step 3: Run the check gate**

Run: `npm run check`
Expected: exit 0 (Prettier checks Markdown too). Fix formatting if needed.

- [ ] **Step 4: Commit**

```bash
git add docs/feature-modules.md AGENTS.md
git commit -m "docs: document the Supabase single-folder boundary rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- "All client usage in `supabase/`" → Tasks 3–11 extract cards, decks, folders, custom-cards queries + auth; Task 12 proves it. ✓
- "`row → type` mapping stays in domain" → Tasks 4, 5, 7, 8, 10 keep mapping in `db/`. ✓
- "Auth centralized too" → Task 11. ✓
- 3 placement-violation moves (custom-cards, WishlistIcon, LocalizedCardThumb) → Tasks 10, 2, 1. ✓
- Document the rule → Task 13. ✓

**Placeholder scan:** No TODO/TBD; every code step shows full file content or exact before/after snippets. ✓

**Type consistency:** Queries layer returns `{ rows, hasMore }` (cards) / `{ rows, count, offset }` (custom-cards) consistently; domain layers consume those exact shapes. `DeckDbRow`/`FolderDbRow`/`CustomCardRow` are defined once in the queries layer (Tasks 6, 9) and imported by domain layers (Tasks 7, 8, 10) — no redeclaration. `queryCustomCards` (domain) wraps `queryCustomCardRows` (query) — names distinct and matched. ✓

**Known risk flagged for executor:** `unassignCollectionCopiesFromDeck` keeps its `userId` param for API stability though the query no longer uses it (`void userId;`); if lint forbids, rename to `_userId`. Documented inline in Task 7 Step 3.
