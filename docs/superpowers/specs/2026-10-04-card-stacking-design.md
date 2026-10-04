# Configurable card stacking — collection, wishlist, deck

**Date**: 2026-10-04
**Status**: Design approved, ready for planning

## Context and goal

This is sub-project 1 of the **bulk edit** effort. Bulk edit (sub-project 2) selects
_tiles_, and a tile is a _stack_ of physical copies. So the stacking granularity _is_
the selection granularity. Today there is only one rule, and it is hard-coded:
`groupByOracleId` (`src/lib/card/utils/group-cards.ts:22`) puts every copy of the same
card (all printings) in one tile. You cannot select "my 2 foil Sol Rings but not the 3
non-foil ones".

**Goal**: let the user choose, per list, which copy properties split stacks. The name is
always one of them. On top of it the user can add printing, finish, condition, language
and the proxy/altered/for-trade flags. The user can also turn stacking off (one tile per
physical copy). The choice is persisted in the user's profile.

The deck already has bulk selection/edit (`useDeckBulkSelection`, `DeckBulkActionBar`,
`DeckBulkEditModal`). Collection and wishlist have none. That is sub-project 2, out of
scope here.

### Existing facts the design relies on

- Collection and wishlist stack on the in-memory **facets index**
  (`useIndexedCollection.ts:44`), _before_ paging (`usePagedCards`). So restacking is
  instant and needs no fetch.
- `filterStacks` (`group-cards.ts`) filters the stack _representatives_, then maps each
  surviving representative back to its stack via `cardGroupKey(rep)` (= oracle).
- `CollectionView.stackByCardId` (`CollectionView.tsx:84`) indexes stacks by `rep.id`
  (= **print** id) for click/menu/overlay lookup.
- `CardList` items are keyed by `cardKey` = `entry.rowId` for copies
  (`src/lib/card/utils/card-key.ts`).
- Deck: `useDeckCardSections` builds `groupByCardId` (oracle → copies by zone, across
  zones). It is used by the card modal, the collection badge, the overlay and export.
  Sections dedupe per oracle inside each zone, and `countById` is keyed by the
  representative's **print** id.
- Profile preferences are **typed columns, no jsonb**
  (`20260713120000_add_profile_preferences.sql`; `text[]` precedent:
  `ignored_tags`). Writes go optimistic + `profile-update` sync op via
  `ProfileContext.updateProfile`, which is a no-op without a user.

## Decisions

| Topic                | Decision                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Criteria offered     | name (always) + print, finish, condition, language, flags (proxy/altered/for-trade as one) — condition and language separate |
| No stacking          | yes, as an exclusive mode (`'copy'`)                                                                                         |
| Lists                | collection, wishlist, deck owner view                                                                                        |
| Scope of the setting | one per list                                                                                                                 |
| Persistence          | profile (DB) for signed-in users; `localStorage` fallback when signed out                                                    |
| UI                   | "Stack by" popover in the `CardList` toolbar row, next to the view-mode toggle                                               |
| Deck                 | stacks never span zones; stacking applies inside each zone section                                                           |
| Deck bulk selection  | keyed by stack (zone-scoped), cleared when the stacking changes                                                              |
| Phasing              | phase 1 = domain + collection + wishlist + persistence (shippable alone); phase 2 = deck                                     |

## Design

### 1. Domain and stack key

In `src/types/cards.ts`, next to `CardStack`:

```ts
export type StackCriterion = 'print' | 'finish' | 'condition' | 'language' | 'flags';
/** [] = by name (default, current behaviour); 'copy' = no stacking. */
export type StackBy = StackCriterion[] | 'copy';
```

`'copy'` mixed with other criteria cannot be represented.

Pure function `stackKeyOf(copy, stackBy)` in `group-cards.ts`:

- `'copy'` → `entry.rowId`.
- otherwise `cardGroupKey(copy)` (oracle_id, else print id for custom cards). Then, in a
  **fixed order** regardless of the array order, append one segment per selected criterion:
  - `print` → `copy.id`
  - `finish` → `'etched'` if `isFoil && foilType === 'etched'`, `'foil'` if `isFoil`,
    else `'nonfoil'`
  - `condition` → `entry.condition ?? 'NM'`
  - `language` → `entry.language ?? copy.lang`
  - `flags` → three bits `proxy|alter|forTrade` (absent = false)

  Missing values get explicit defaults so "unset" and the default value stack together.

`groupByOracleId(cards)` becomes `groupByStack(cards, stackBy: StackBy = [])`. The
representative selection (`preferPrint` → `cards[0]`) and the first-seen order do not
change. The default argument keeps the import preview and `useCollectionCards`
behaviour identical.

`StackOf<T>` / `CardStack`: rename `oracleId` → **`key`**. It is read in only two places
(`page-window.ts:31`, `filterStacks`), and the field no longer holds an oracle id.

### 2. Collision fixes (required as soon as stacks are finer than oracle)

1. **`filterStacks`**: map a filtered representative back to its stack by representative
   identity (`entry.rowId`), not by `cardGroupKey(rep)`. Otherwise two stacks of the
   same card overwrite each other and one disappears.
2. **`CollectionView.stackByCardId`**: index by `rep.entry.rowId`, and look up with
   `cardKey(card)`, not `card.id`. Otherwise "Sol Ring foil" and "Sol Ring non-foil"
   stacks of the same printing share one lookup entry, which gives the wrong click,
   menu and count.

Filter semantics do not change: filters run on the representative, and the
deck-assignment filter is per copy, before stacking. With finer stacks they become more
exact (a foil stack only holds foils). This is intended.

### 3. UI — `StackByMenu`

- `CardList` gets a new optional prop **`toolbarExtra?: ReactNode`**, rendered on the
  same row as the view-mode toggle (`CardList.tsx:114`), in both the flat and the
  sections branches. If `viewModes.length <= 1`, the row is rendered anyway when
  `toolbarExtra` is set. The ~20 other consumers are untouched.
- New component `src/lib/card/components/StackByMenu/` with props
  `{ value: StackBy; onChange: (v: StackBy) => void }`:
  - **Button** summarises the state: "Empiler : Nom", "Empiler : Nom + Édition +
    Finition", past two criteria "Nom + N critères", and "Non empilé".
  - **Panel**: radio "Ne pas empiler" / "Empiler par". Under the latter: "Nom" (checked,
    disabled), Édition, Finition, État, Langue, Proxy/altérée/échange. The checkboxes are
    disabled while "Ne pas empiler" is on. The component remembers the last criteria in
    local state, so switching back to "Empiler par" restores them.
  - Applies **on every click**, with no Apply button.
  - Closes on outside click and Escape, and returns focus to the button. Uses real
    `<label>`s and radio/checkbox inputs.
  - A small anchored panel owned by the component. The repo has no Popover component.
    Do not generalise one until there is a second user.
- i18n: new `stacking` namespace, fr + en.
- Visible effects: the `xN` badge = stack size (hidden at 1, so it never shows in
  `'copy'` mode). Paging resets to page 1 (`resetKey` includes `stackBy`). The
  "quantity" sort sorts by stack size. It is useless but harmless in `'copy'` mode and
  stays available.

### 4. Persistence

**Migration** `supabase/migrations/<ts>_add_profile_stack_by.sql`, idempotent:

```sql
alter table public.profiles
  add column if not exists collection_stack_by text[] not null default '{}'::text[],
  add column if not exists wishlist_stack_by   text[] not null default '{}'::text[],
  add column if not exists deck_stack_by       text[] not null default '{}'::text[];
```

Plus one CHECK per column (drop-if-exists then add):

```sql
check (
  <col> <@ array['print','finish','condition','language','flags','copy']::text[]
  and (not ('copy' = any(<col>)) or <col> = array['copy']::text[])
)
```

- Default `'{}'` = by name, so existing rows backfill with no visible change.
- No new GRANT: these are new columns on a table that is already granted.
- `supabase/verify_schema.sql`: add the 3 columns and the 3 constraints to the
  assertions.
- `profiles` is publicly readable when `is_public`. These columns are harmless. Add them
  to `fetchProfile`'s select only, **not** `fetchProfileByNickname` (public view).

**Client**:

- `Profile` / `ProfileUpdate` (`src/lib/profile/types.ts`): `collectionStackBy`,
  `wishlistStackBy`, `deckStackBy: StackBy`.
- `profiles.ts`: row → domain maps `['copy']` → `'copy'` and drops unknown values. Domain
  → row (`upsertProfile`) does the reverse. Defaults go in the `profile-store.ts`
  fallback profile.
- Writes go through `updateProfile(patch)`: optimistic, then `profile-update` sync op
  (works offline via the queue).
- Single entry point **`useStackBy(list: 'collection' | 'wishlist' | 'deck')`** →
  `[stackBy, setStackBy]`:
  - signed in: reads the profile field, writes via `updateProfile`;
  - signed out: `localStorage` key `wizcard.stackBy.<list>`, read and write wrapped in
    try/catch, falls back to `[]`. No merge on sign-in: the profile wins.
- While the profile loads the value is `[]`. If the profile arrives with another value,
  the list restacks once. The facets index loads in parallel, so this is normally not
  visible. No dedicated waiting state.

### 5. Collection and wishlist wiring

- `useIndexedCollection(entries, { filterable, stackBy })` calls
  `groupByStack(copies, stackBy)`, adds `stackBy` to the `facetStacks` memo deps, and
  includes it in `resetKey`. This applies to both the filterable (collection) and
  non-filterable (wishlist) branches.
- The collection page and the wishlist page each call `useStackBy(...)` and pass
  `<StackByMenu>` into `CollectionView` → `CardList.toolbarExtra`.

### 6. Deck (phase 2)

- **`groupByCardId` is unchanged**: it stays the oracle-level, cross-zone logical card,
  for the card modal, export, tokens and the "in other decks" tooltips.
- **Sections** (`useDeckCardSections`): in each zone, replace the oracle dedupe with
  `groupByStack(zoneCards, deckStackBy)`. Each stack yields one tile (its representative)
  and its `copies`. Every count (`countById`, the `groupByCardType` per-type counts, the
  table quantity column at `DeckDetailOwnerView.tsx:230`) is keyed by the
  representative's **`entry.rowId`**. The hook also returns a
  `stackByRowId: Map<rowId, { key, zone, copies }>` for the overlay and the selection.
- **Overlay** (`DeckCardOverlay`): takes **`stackCopies`** instead of deriving
  `group.byZone.get(currentZone)`. Count, `+1` (duplicate last copy), `−1`, move to zone,
  wishlist target, add to collection: all act on the displayed stack. In by-name mode
  `stackCopies` equals today's `zoneCopies`, so the default behaviour does not change.
- **Collection badge** (`useCollectionBadge`): owned/needed counts are computed on
  `stackCopies`. The tooltips still use `group`.
- **Bulk selection** (`useDeckBulkSelection`): the selection key becomes
  `` `${zone}:${stackKey}` `` and resolves to that stack's copies' `rowId`s (no more
  cross-zone resolution through `groupByCardId`). Section "select all" and the global
  "select all" use the stack keys. The selection is cleared when `deckStackBy` changes.
- The deck owner view calls `useStackBy('deck')` and passes `<StackByMenu>` to its
  `CardList`. The read-only view and the Tokens panel are unchanged.

## Out of scope

- Selection and bulk edit for collection/wishlist (sub-project 2, built on these stacks).
- Stacking in the read-only deck view, search, sets, profile pages.
- Stacking by tags or by deck assignment.
- Generic Popover component.

## Verification

No test framework in the repo, and `npm run check` is red at base. So:

- **Static**: `npx eslint` + `tsc` on changed files, with **no new problems**. Then
  `npm run build` (catches TS2589 and server-only import leaks, which per-file checks
  miss).
- **DB**: `npm run sb:migrate`, then `npm run sb:verify` passes with the new assertions.
  Manually confirm the CHECK rejects `'{copy,print}'` and `'{foo}'`.
- **Browser** (local dev, non-EN profile):
  - Collection: each criterion alone, a combination, and "Non empilé".
  - Correct `xN` badges. Click and context menu open the right stack: same printing, foil
    vs non-foil, two stacks, each opens its own.
  - A filter combined with fine stacking. The quantity sort.
  - The setting survives a reload when signed in (DB) and when signed out
    (localStorage). The wishlist keeps its own setting.
  - Deck: stacks per zone; `+1` / `−1` / move on a foil stack; quantity column;
    per-stack selection; by-name mode identical to today.
- **Prod**: apply the migration via the usual workflow (idempotent script in the SQL
  editor, sync `schema_migrations`). Not done by the implementation.
