# Bulk selection and edit — collection, wishlist (and deck, shared)

**Date**: 2026-10-18
**Status**: Implemented 2026-10-18 on branch `feat/bulk-edit-sp2` (not merged, not pushed). Runtime checks of the Verification section pending.
**Prerequisite**: sub-project 1, configurable stacking
([2026-10-04-card-stacking-design.md](2026-10-04-card-stacking-design.md)), merged into `main`.

## Context and goal

This is sub-project 2 of the **bulk edit** effort. Sub-project 1 made stacking
configurable, so a tile is now exactly the set of copies the user wants to act on
together. The deck already has a selection mode with bulk actions, but its code lives
local to its route (`src/app/[locale]/decks/[id]/`). Collection and wishlist have no
selection.

**Goal**: a selection mode on `/collection` and `/wishlist`. The user selects tiles
(stacks), and every action applies to **all the copies** of the selected stacks:

| List       | Actions                                          |
| ---------- | ------------------------------------------------ |
| Collection | Edit fields · Add to a deck · Remove             |
| Wishlist   | Edit fields · Move to collection · Remove        |
| Deck       | unchanged (edit, +collection, +wishlist, remove) |

To act on one specific copy, the user switches stacking to finer criteria or to
"Ne pas empiler". This sub-project adds no per-copy selection inside a stack.

### Existing facts the design relies on

- **One `card_entries` row can belong to several views.** A collection copy assigned to a deck
  has `owner_id` + `deck_id`. A wishlisted deck card has `deck_id` + `wishlist=true` and
  `owner_id = NULL`. Every existing flow handles this by hand, and the bulk flows must
  apply the same rules per copy:
  - `WishlistContext.removeFromWishlist`: a wishlist row that is a deck card only loses
    its flag (`deck-card-update { wishlist: false }`). A pure wishlist row is deleted.
  - `collection-store.clearCollection`: a deck-linked copy is _detached_
    (`owner_id → null`, it stays in its deck). Other copies are deleted.
  - `WishlistContext.moveToCollection`: flips in place (same `rowId`,
    `wishlist=false`). A deck card also gets `owner_id = userId` through
    `deck-card-update`, because a plain `update` filters on `owner_id` and would match
    0 rows.
- **Invariant**: the same `rowId` is never in both the collection and the wishlist.
- The collection is **paged** (`usePagedCards`), but `useIndexedCollection` builds
  `facetStacks` in memory: every entry, filtered and stacked, each copy carrying its
  `entry`. "Select all" resolves `rowId`s from it without loading full cards.
- The sync queue (`src/lib/supabase/sync-queue.ts`) has `bulk-insert` / `bulk-delete`
  but **no `bulk-update`**. Today a bulk edit of N copies enqueues N ops (deck:
  `handleBulkEditApply` loops `changeZone` + `updateDeckCard` per `rowId`).
- PostgREST rejects an `in()` filter of ~300 uuids with 414. 200 is the established
  chunk size.
- `AddToDeckModal` already holds the deck picker + zone picker logic
  (`zonesForFormat`, effective zone when the deck changes).
- There is no toast / notification system in the app. `ConfirmModal` exists.

## Decisions

| #   | Question                               | Decision                                                                                                                                       |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Actions                                | Edit, remove, wishlist → collection, collection → deck.                                                                                        |
| 2   | "Select all" on the paged collection   | Every stack matching the active filters, loaded or not (via `facetStacks`).                                                                    |
| 3   | Collection → deck                      | Attach the copies themselves (`deck_id` on the row). A copy already in another deck is **moved** (it leaves that deck).                        |
| 4   | Wishlist → collection                  | Direct, confirmation only. Each copy keeps its printing and metadata.                                                                          |
| 5   | Code layout                            | **Shared module** `src/lib/card/bulk/`. The deck moves onto it and keeps its specifics.                                                        |
| 6   | Collection edit fields                 | Condition, language, finish, proxy, for trade, altered, tags add, tags remove, purchase price.                                                 |
| 7   | Wishlist edit fields                   | Condition, language, finish, tags add, tags remove.                                                                                            |
| 8   | Deck edit fields                       | Current ones (zone, condition, language, finish, proxy, for trade, altered, tags add) **+ tags remove**. No purchase price.                    |
| 9   | Removing a deck-linked collection copy | **Detach** it (like "Vider la collection"): it leaves the collection and stays in its deck as an unowned card. The confirmation says how many. |
| 10  | Sync                                   | New `bulk-update` op, grouped by identical patch. **No DB migration.**                                                                         |

Out of this sub-project: bulk collection → wishlist, per-copy selection inside a stack,
choosing a printing during the move to the collection, any toast system.

## Design

### 1. Shared module `src/lib/card/bulk/`

| Unit                    | Kind      | Role                                                                                                                                                                  |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBulkSelection`      | hook      | `selectMode`, `selected: Set<string>` (stack keys); `toggle`, `toggleKeys`, `areAllSelected`, `clear`, `enter`, `exit`, `toggleMode`. Takes a `resetKey` (see below). |
| `rowIdsOfSelected`      | pure      | `(selected, stackByKey, predicate?) → rowId[]`. Stale keys are ignored. Generalises the deck's `rowIdsOfSelectedStacks`.                                              |
| `BulkActionBar`         | component | Floating bar: exit button, counter, select all / deselect all, then `actions: { id, label, onClick, variant? }[]`, disabled while the selection is empty.             |
| `BulkEditModal`         | component | Tri-state fields picked by `fields: BulkField[]`, plus an optional `extra` slot (the deck's zone picker). Returns a `BulkEdit`.                                       |
| `applyBulkEdit`         | pure      | `(entry, edit) → CardEntry`: the new entry of one copy.                                                                                                               |
| `entryToDbPatch` / diff | pure      | `(before, after) → DbPatch`: only the DB columns that changed. An empty patch means the row is skipped.                                                               |

```ts
type BulkField =
	| 'condition'
	| 'language'
	| 'finish'
	| 'proxy'
	| 'forTrade'
	| 'alter'
	| 'tagsAdd'
	| 'tagsRemove'
	| 'purchasePrice';

type BulkEdit = {
	/** Fields set to the same value on every copy (tri-state already resolved). */
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
```

`applyBulkEdit` rules:

- `tags = (current − removeTags) ∪ addTags`, keeping the existing order and appending
  new tags at the end.
- **The deck zone tag is protected.** `removeTags` never removes it, whatever the
  input. It is matched with the helpers that read and write it (`getDeckZone` /
  `setDeckZone`).
- Finish: `isFoil = false` clears `foilType`. `isFoil = true` without a type sets
  `'foil'`.
- Purchase price: an empty string from the field means "unchanged". There is no
  "clear the price" in this sub-project.

`useBulkSelection` clears the selection **at render time** when `resetKey` changes,
not in a `useEffect`. That is the pattern the deck sample hand already uses. Collection and
wishlist pass `JSON.stringify(filters) + stackBy`, and the deck passes its `deckStackBy`.
This also fixes the deferred minor from sub-project 1 ("the deck selection is not
cleared when `deckStackBy` changes").

### 2. `bulk-update` sync op

```ts
| {
	id: string;
	type: 'bulk-update';
	payload: { rows: Array<{ rowId: string; updates: DbPatch }> };
	retries: number;
	createdAt: string;
  }
```

`DbPatch` = the DB-column subset already accepted by `updateDeckCard`
(`scryfall_id`, `tags`, `owner_id`, `proxy`, `is_foil`, `foil_type`, `condition`,
`language`, `purchase_price`, `wishlist`, `deck_id`) **plus `for_trade` and `alter`**.

Executor (`useSyncQueue.executeOp`) → `updateCardRowsGrouped(rows)` in the db layer:

1. Group rows by `stableStringify(updates)`, a key-sorted JSON.
2. For each group, `update(updates).in('id', chunk)` in chunks of **200**.
3. It matches on `id` only, like `deck-card-update`: rows with `owner_id = NULL`
   (wishlist deck cards) are reachable, and RLS protects them.

The grouping lives in a pure function `groupRowUpdates(rows, chunkSize)` so it can be
tested. A uniform edit ("condition = NM" on 500 copies) costs 3 requests. Adding tags
splits groups by each copy's original tag set, which stays a small number in practice.

The whole op is retried as one unit. Every update is idempotent (absolute values, not
increments), so a partial failure followed by a retry converges.

### 3. Store actions

Each action does a single `set()` per store touched and enqueues a single op (or a
single op per kind), then calls `triggerSync()` once.

**Collection** (`collection-store` + `CollectionContext`):

- `bulkUpdate(rowIds, edit)` → `applyBulkEdit` per copy, `bulk-update`.
- `bulkRemove(rowIds)` → `planCollectionRemove(copies)` returns `{ deleteIds, detachIds }`:
  - free copies → `bulk-delete`;
  - deck-linked copies (`entry.deckId` set) → `bulk-update { owner_id: null }`. They
    leave the collection store, and their deck-store copy (if the deck is loaded) loses
    its ownership.
- `bulkAssignToDeck(rowIds, deckId, zone)` → `planAssignToDeck(copies, deckId)` sorts
  each copy into one of:
  - **free**: `deckId` + zone tag set, added to the target deck in the deck store (if
    loaded);
  - **in another deck**: same, and also removed from the source deck in the deck store
    (if loaded), and its `updatedAt` refreshed;
  - **already in the target deck**: only the zone tag changes.

  One `bulk-update`. The deck-store mutation reuses the shape of
  `addCollectionCardToDeck` (the collection row serves as the deck card row).

**Wishlist** (`WishlistContext`, which already holds the deck-card rules):

- `bulkUpdate(rowIds, edit)` → `bulk-update`, mirrored onto loaded deck cards
  (`patchLoadedDeckCard`).
- `bulkRemove(rowIds)` → deck cards: `bulk-update { wishlist: false }`. Others:
  `bulk-delete`.
- `bulkMoveToCollection(rowIds)` → every row: `wishlist=false`, `owner_id=userId`
  (harmless for pure wishlist rows, required for deck cards). One `bulk-update`. Same
  in-memory moves as `moveToCollection`, minus the printing/patch step.

**Deck** (`deck-store` + `DeckContext`):

- `bulkUpdateDeckCards(rowIds, edit, zone?)` replaces the `changeZone` +
  `updateDeckCard` loop in `handleBulkEditApply`. The zone is applied as a tag through
  `setDeckZone`, after `applyBulkEdit`. One `bulk-update`.
- Bulk removal from the deck is unchanged (it already has its own delete/detach logic,
  `BulkRemoveDeckCardsModal`).

### 4. Interface

**Entry point**: a "Sélectionner" button on the card list toolbar row, next to
`StackByMenu`, on `/collection` (through a `CollectionView` prop) and on `/wishlist`.
It is shown only to the owner, which are the only pages concerned.

**In select mode** (collection, wishlist):

- clicking a tile toggles it. The overlay is the deck's checked frame, moved into a
  shared `BulkSelectOverlay` component;
- the context menu and opening the card modal are disabled;
- `Escape` leaves the mode;
- the `BulkActionBar` counter reads "12 cartes · 31 copies";
- "Tout sélectionner" takes every key of `facetStacks` and is disabled while the index
  is loading.

**Selection key**: the representative copy's `rowId` (`cardKey(rep)`). Since
sub-project 1, a key by `rep.id` or oracle collides as soon as stacks are finer than the
card name. A `stackByKey: Map<string, FacetStack>` built from `facetStacks` serves
`rowIdsOfSelected` and the counter.

**Modals**:

| Action                        | Modal                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit                          | `BulkEditModal` with the list's fields. Title: "Modifier N copies".                                                                                                                                 |
| Add to a deck (collection)    | New `BulkAddToDeckModal`: deck picker (my decks, by name like `AddToDeckModal`), zone picker (`zonesForFormat`), and a summary: "31 copies, dont 5 déplacées depuis _Atraxa_, 2 déjà dans ce deck". |
| Remove (collection)           | `ConfirmModal`: "Retirer 31 copies de la collection ?" + "4 copies resteront dans leur deck" when any are deck-linked.                                                                              |
| Remove (wishlist)             | `ConfirmModal`: "Retirer 31 copies de la wishlist ?".                                                                                                                                               |
| Move to collection (wishlist) | `ConfirmModal`: "Déplacer 31 copies vers la collection ?".                                                                                                                                          |

The modals announce every effect **before** confirming, which is why no toast is needed.
After an action, the selection is cleared and select mode stays on.

**i18n**: new keys in the `collection` and `wishlist` namespaces (fr, en). Plurals use
ICU (`{count, plural, …}`) like the existing `selectedCount` / `editNCards`. The shared
components take their labels from a shared namespace (`bulk`), so the deck can use them
too.

### 5. Deck migration onto the shared module

- `useDeckBulkSelection` → `useBulkSelection` (`resetKey = deckStackBy`). Selection
  keys stay `DeckStack.selectionKey` (zone + stack).
- `rowIdsOfSelectedStacks` → `rowIdsOfSelected`. The `deck-bulk-selection.test.ts`
  test is moved or adapted.
- `DeckBulkActionBar` → `BulkActionBar` with the 4 deck actions.
- `DeckBulkEditModal` → `BulkEditModal` with the deck fields + the zone picker in
  `extra`.
- What stays in the deck route: `SectionSelectButton`, `BulkRemoveDeckCardsModal`, and
  "+collection / +wishlist" (`useAddDeckToCollection`).

### Edge cases

- **Stale keys** (a stack deleted in another tab, or by sync): ignored by
  `rowIdsOfSelected`. The counter counts only resolved stacks.
- **Selection while the index loads**: "Tout sélectionner" is disabled. A tile click
  works on visible tiles.
- **Empty patch** (every field left untouched): "Appliquer" is disabled, as in the deck
  today. Rows whose computed patch is empty are not sent.
- **Collection → deck with no deck**: the modal shows an empty state with a link to
  `/decks`.
- **Moving a copy out of a deck that is not loaded**: only the DB and the collection
  store change. The deck store reloads the deck when it opens.
- **Signed out**: unreachable (`/collection` and `/wishlist` redirect to login).

## Verification

**Pure-function tests** (`node:test` through `tsx`, no framework, see
the "Tests" note of the stacking spec):

- `src/lib/card/bulk/apply-bulk-edit.test.ts`: tags add/remove/order, zone tag
  protected, foil ↔ foilType, untouched fields, purchase price.
- `src/lib/card/bulk/db-patch.test.ts`: the before/after diff, empty patch.
- `src/lib/supabase/group-row-updates.test.ts`: grouping by identical patch, key order
  ignored, chunks of 200.
- `src/lib/card/bulk/row-ids-of-selected.test.ts`: stale keys, predicate.
- `src/lib/collection/plan-collection-remove.test.ts`: delete/detach split.
- `src/lib/collection/plan-assign-to-deck.test.ts`: free / other deck / target deck.
- The existing deck tests (`deck-card-sections`, `deck-bulk-selection` or its moved
  version) stay green.

**Static**: `npm run check` with no NEW problems on the changed files (the base already has
~60 pre-existing problems in unrelated files), plus `npm run build` (TS2589 and the server
import boundary are only caught there).

**Runtime** (dev at `http://localhost:<port>`, **not** `127.0.0.1`), with a user that
has a collection, a wishlist and two decks:

1. Collection, stacked by name: select 3 tiles, edit condition + add a tag → each copy
   changed. The Network tab shows a few `PATCH … id=in.(…)` requests, not one per copy.
2. Collection, "Tout sélectionner" with a filter on: the counter matches the filtered
   stats, including unloaded pages.
3. Collection → deck B, with copies already in deck A: they leave A and appear in B.
   Check both decks after a reload.
4. Collection remove with deck-linked copies: they disappear from the collection and
   stay in their deck (unowned).
5. Wishlist → collection, including a wishlisted deck card: it appears in the
   collection, leaves the wishlist, and stays in its deck.
6. Wishlist remove of a deck card: the deck card remains, without the flag.
7. Deck: bulk edit + zone change + tag removal behave as before (zone tag never
   removed).
8. Changing the stacking or a filter clears the selection.
9. Studio: the rows match. The sync queue is empty (no failed op).

## Implementation notes (deviations from the design above)

Decided during implementation (2026-10-18). Where this section and the design disagree,
this section wins.

- **Selection key**: for collection and wishlist the key is `stack.key` (unique per stack
  in `groupByStack`; `toCardStack` copies it unchanged), not the representative rowId. A
  paged `CardStack` can drop an unresolvable first copy and change its representative.
- **Where the actions live**: cross-store bulk actions are in
  `src/lib/collection/bulk-actions.ts` and `src/lib/wishlist/bulk-actions.ts`, with the
  pure plans in `bulk-plans.ts` next to them. They are bound by `CollectionContext` /
  `WishlistContext`. collection-store must not import deck-store (deck-store already
  imports collection-store).
- **Select mode after applying**: deck bulk edit still exits select mode after applying
  (unchanged behaviour); collection and wishlist clear the selection and stay in select
  mode.
- **Deck bulk edit tags**: tags now ADD, and there is a new "tags to remove" field. The
  old deck modal replaced the whole tags array, which wiped the `deck:<zone>` tag. Deck
  bulk edit also now persists proxy / for_trade / alter (the old `updateDeckCard` DB patch
  dropped them).
- **Zone tags**: deck zone tags (`deck:` prefix) are refused both in tags-to-remove and
  in tags-to-add.
- **Foil normalisation**: `applyBulkEdit` normalises a foil copy with no foilType to
  `'foil'` when it is edited (legacy rows were misfiltered by the foil filter).
- **`ownerId` handling**: wishlist to collection also sets `ownerId` on the loaded deck
  copy (the single-row `moveToCollection` does not). Collection remove clears `ownerId`
  on the loaded deck copy of detached rows.
- **Collection to deck**: only patches decks already loaded in the deck store (no partial
  `decksCards[deckId]` for unloaded decks; `hydrateActiveDeck` re-reads the DB).
- **Grid views only while selecting**: while select mode is on, the list is restricted to
  grid views (CardList `viewModes`), because the table view has no overlay. The user's
  chosen view comes back when select mode ends. Deck owner view: `['fluid-grid','grid']`.
- **Escape**: exits select mode only when focus is not in an input / textarea / select /
  contenteditable and no modal is open (`escapeDisabled`).
- **Selection reset**: `useBulkSelection(resetKey)` resets at render time, which also
  fixes the SP1 deferred minor "deck selection not cleared when deckStackBy changes".
- **`bulk-update` op**: no migration. The id-only match is protected by RLS (UPDATE
  policy `owner_id = auth.uid()` OR deck in my decks), and every written column is in the
  column-level UPDATE grant.

### Follow-ups

Not done, non-blocking.

- Deck bulk edit does not mirror into the collection/wishlist stores (pre-existing for
  the single-row `updateDeckCard`); a later single-row collection `update` op can write
  the stale full entry back.
- ConfirmModal's confirm is always danger-styled ("Move to collection" looks
  destructive).
- Bulk paths emit no analytics events; the source deck `updatedAt` is not bumped on
  move; wishlist bulk remove/move patch the deck store once per row.
- The persisted `bulk-update` payload stores one `{rowId, updates}` per row; pre-grouping
  would shrink it for very large selections (saveQueue swallows quota errors,
  pre-existing).
- The Escape selector misses `contenteditable=""` / `"plaintext-only"`.

### Verification state

At the time of writing: 22 pure tests pass (bulk-edit 8, entry-db-patch 4,
group-row-updates 4, selection 2, collection bulk-plans 3, wishlist bulk-plans 1); tsc is
clean on touched files; `npm run build` is OK. Runtime/browser checks of the Verification
section: not yet run (to be done before merge).
