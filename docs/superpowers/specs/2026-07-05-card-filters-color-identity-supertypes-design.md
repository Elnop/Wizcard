# Card filters: Color Identity, Color-cost label, Supertypes

**Date:** 2026-07-05
**Status:** Approved (brainstorming), ready for implementation planning

## Goal

Fill three gaps in the shared card-filter UI (used by collection, search page, and
the deck card-search "finder"):

1. Add a **Color Identity** filter (Scryfall Commander semantics, `ci<=` "at most").
2. **Clarify** that the existing color filter matches mana-cost colors — relabel it
   `Colors (cost)`.
3. Add **supertypes** (Legendary, Basic, Snow, World, …) to the Type filter's
   suggestions catalog.

Non-goals: no new matching modes for the cost-color filter; no separate supertype UI
section; no color-identity mode selector.

## Context

The filter system is shared:

- Filter state shape: `CardFilters` / `DEFAULT_CARD_FILTERS` / `countActiveFilters` in
  `src/lib/search/types.ts`.
- Collection extends it: `CollectionFilters` / `defaultCollectionFilters` in
  `src/lib/card/utils/filterCollectionCards.ts`, which also holds the **local**
  matching logic (`cardMatchesFilters`, `matchColors`, `matchesType`).
- Shared UI: `src/lib/search/components/FilterModal/FilterModal.tsx` composes
  `ColorFilter`, `TypeFilter`, etc. Consumers: `CollectionView`, `search/page.tsx`,
  and `CardSearchPanel` (deck finder).
- Scryfall query builder: `src/lib/scryfall/utils/scryfall-query.ts` — already
  supports a `colorIdentity` param emitting `ci<=<colors>`.
- Search hook `SearchFilters` (`useScryfallCardSearch.ts`) already carries an optional
  `colorIdentity?: ScryfallColor[]` (currently only fed by the commander constraint).
- Type catalog: `src/lib/scryfall/endpoints/catalog.ts` `TYPE_CATALOGS` list →
  `getAllCardTypes()`; the catalog-name union type lives in
  `src/lib/scryfall/types/api.ts` (`ScryfallCatalogType`).
- `color_identity` is a required field on the Scryfall card type — data is available
  for local filtering.

## Part 1 — Supertypes

**Change:** add `'supertypes'` to `TYPE_CATALOGS` in `catalog.ts`, and add
`'supertypes'` to the `ScryfallCatalogType` union in `types/api.ts`.

Effect: Legendary/Basic/Snow/World/Ongoing/Host/Elite join the deduped, sorted list
returned by `getAllCardTypes()` and surface in the existing `TypeFilter` suggestions.
No other change needed:

- Scryfall query: `buildTypeQuery` already emits `t:legendary` — valid for supertypes.
- Local match: `matchesType` does a case-insensitive `includes` on `type_line`, which
  contains the supertype word (e.g. "Legendary Creature — Elf").

## Part 2 — Color (cost) label

**Change:** in `ColorFilter.tsx`, relabel `Colors` → `Colors (cost)`. Cosmetic only;
the three modes (include / exact / atMost) are unchanged.

## Part 3 — Color Identity filter

### State (`src/lib/search/types.ts`)

- Add `colorIdentity: ScryfallColor[]` to `CardFilters`.
- Add `colorIdentity: []` to `DEFAULT_CARD_FILTERS`.
- In `countActiveFilters`, add `+ filters.colorIdentity.length`.
  (`CollectionFilters` inherits the field via `CardFilters`; `defaultCollectionFilters`
  inherits `[]` via `...DEFAULT_CARD_FILTERS`.)

### UI component

New `ColorIdentityFilter` under
`src/lib/search/components/filters/ColorIdentityFilter/`:

- Same 5-color button grid as `ColorFilter` (reuse `MTG_COLORS`, `ManaSymbol`,
  `useMultiSelect`, and the same CSS module pattern).
- Label: `Color identity`.
- **No mode selector** — semantics are fixed to `at most` (`ci<=`).
- Props: `{ selected: ScryfallColor[]; onChange; symbolMap? }`.

Rendered in `FilterModal` immediately after `ColorFilter`, inside the same
`variant !== 'backs'` block, so it appears everywhere the color filter does
(collection, search, finder).

### Local matching (`filterCollectionCards.ts`)

Add `matchColorIdentity(cardColorIdentity, selected)` with **at-most** semantics:
`selected.length === 0 || (cardColorIdentity ?? []).every((c) => selected.includes(c))`.
Wire into `cardMatchesFilters`:
`if (!matchColorIdentity(card.color_identity, filters.colorIdentity)) return false;`
(`card.color_identity` exists on `ScryfallCard`; `AnyCard` union — read defensively as
it may be absent on `CustomCard`, treat missing as empty ⇒ matches.)

### Scryfall query path

`buildScryfallQuery` already emits `ci<=`. `SearchFilters.colorIdentity` already
exists. Work is propagation only.

### FilterModal wiring

- Add `colorIdentity: ScryfallColor[]` to `FilterModalProps`, the internal
  `FilterModalContentProps` (`initialColorIdentity`), the draft state, `onApply`
  payload, and `handleReset` (reset to `[]` in the `variant !== 'backs'` branch).

### Consumer wiring

- **CollectionView** (`useCollectionFiltering` + `CollectionFiltersBar`/`Aside` /
  `CollectionView.tsx`): pass `colorIdentity` from `filters` into `FilterModal` and set
  it back in the apply handler. Local filtering flows through `filterCollectionCards`,
  which now honors it.
- **search/page.tsx** + `useSearchFiltersFromUrl.ts`: thread `colorIdentity` through
  the URL filter state and into both the `FilterModal` and the Scryfall search filters.
- **CardSearchPanel** (deck finder): add `colorIdentity` state; feed it to `FilterModal`
  and `handleApplyFilters`; add it to `activeFilterCount`; include it in
  `collectionFilters` (local, in-collection mode) and `scryfallFilters`.

  **Commander combination (important):** `scryfallFilters.colorIdentity` is currently
  set from `commanderColorIdentity` (the commander constraint). The user's
  color-identity selection must **combine** with, not overwrite, that constraint.
  Since both are `ci<=` (at most) sets, the effective constraint is their
  **intersection**: allowed = commanderCI present ? user ∩ commander : user.
  - If commander constraint present and user selects colors: pass
    `userSelection.filter((c) => commanderColorIdentity.includes(c))`.
  - If commander constraint present and user selects nothing: pass commander set (today's
    behavior).
  - If no commander constraint: pass the user selection (or `undefined` when empty).
    Apply the same intersection to the in-collection local path (the existing
    `commanderColorIdentity.every(...)` post-filter already narrows to commander; the
    user selection narrows further via `filterCollectionCards`).

## Testing / verification

No test framework in this repo ([[project_no_test_framework]]). Verify via:

1. `npm run check` (TS + ESLint + Prettier) — clean.
2. Runtime (dev): in Collection, Search, and a Commander deck's card finder:
   - Type filter suggests `Legendary` and it filters correctly.
   - `Colors (cost)` label shows; behavior unchanged.
   - `Color identity` selecting e.g. {W,U} shows only cards whose identity ⊆ {W,U};
     active-filter badge count includes it; Reset clears it.
   - In a mono/2-color Commander deck finder, a user color-identity selection narrows
     within the commander's identity (intersection), never widening past it.

## Files touched (summary)

- `src/lib/scryfall/endpoints/catalog.ts` — add `'supertypes'`.
- `src/lib/scryfall/types/api.ts` — add `'supertypes'` to `ScryfallCatalogType`.
- `src/lib/search/components/filters/ColorFilter/ColorFilter.tsx` — relabel.
- `src/lib/search/types.ts` — `colorIdentity` field + default + count.
- `src/lib/search/components/filters/ColorIdentityFilter/*` — new component (+ CSS).
- `src/lib/search/components/FilterModal/FilterModal.tsx` — wire new filter.
- `src/lib/card/utils/filterCollectionCards.ts` — `matchColorIdentity` + wire.
- Consumers: `CollectionView` files, `search/page.tsx`,
  `useSearchFiltersFromUrl.ts`, `CardSearchPanel.tsx`.
