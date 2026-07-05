# Color Identity: at-most / exactly mode

**Date:** 2026-07-05
**Status:** Approved (brainstorming), ready for implementation planning

## Goal

The Color Identity filter currently only does `ci<=` ("at most"), which includes
colorless cards (identity `{}` ⊆ any selection) and partial-color cards. Add a
second mode `exactly` (`ci=`) so users can show only cards whose identity is
precisely the selected colors — no colorless, no partial subsets.

Expose it as a two-radio selector under the color buttons, mirroring the existing
`Colors (cost)` filter's include/exact/atMost group. Default stays `atMost`.

Non-goals: no third mode; no change to the cost-color filter; `exact` is not counted
as a separate active filter (it's a modifier of the existing CI filter, like
`colorMatch` is for cost colors).

## Context

Builds directly on the color-identity feature shipped earlier today
([[project_card_filters_color_identity]]). Touch points:

- `CardFilters` / `DEFAULT_CARD_FILTERS` (`src/lib/search/types.ts`) — holds
  `colorIdentity: ScryfallColor[]`. `countActiveFilters` counts
  `colorIdentity.length` (unchanged — the mode is not separately counted).
- `ColorIdentityFilter` (`src/lib/search/components/filters/ColorIdentityFilter/`)
  — currently a button grid with no mode selector. `ColorFilter` already shows the
  pattern for a radio `matchGroup` (reuses `ColorFilter.module.css`
  `.matchGroup`/`.matchOption`).
- Local matcher `matchColorIdentity` (`filterCollectionCards.ts:85-93`) — currently
  atMost only, wired at `cardMatchesFilters` line ~210.
- `buildScryfallQuery` (`scryfall-query.ts:95-97`) — emits `ci<=` when
  `colorIdentity` non-empty. `ScryfallQueryParams` and `SearchFilters`
  (`useScryfallCardSearch.ts`) carry `colorIdentity` (+ `matchNothing`).
- `FilterModal` threads `colorIdentity` through to 3 consumers; a 4th
  (`ImportSupportModals`) and 2 structural `extends CardFilters` consumers
  (`CollectionFilters`, `UseCustomCardsFilters`) also build the filter object.
- Deck finder `CardSearchPanel.tsx:210-243` computes the commander∩user
  intersection (`effectiveColorIdentity`), a `userCiDisjoint` flag → `matchNothing`,
  and applies the local path via `filterCollectionCards`.

## Design

### State (`src/lib/search/types.ts`)

- Add `colorIdentityMatch: 'atMost' | 'exact'` to `CardFilters`.
- Add `colorIdentityMatch: 'atMost'` to `DEFAULT_CARD_FILTERS`.
- `countActiveFilters` UNCHANGED (mode is a modifier, not a filter).
- `CollectionFilters` inherits the field via `extends`; `defaultCollectionFilters`
  inherits the default via `...DEFAULT_CARD_FILTERS`. The literal consumers that
  must add `colorIdentityMatch: 'atMost'` to satisfy the type: `useCustomCards.ts`
  default-param literal, `search/page.tsx` `useCustomCards({...})` call,
  `useSearchFiltersFromUrl.ts` `countActiveFilters({...})` literal. (Custom-cards
  path does not filter by CI — the field is carried unused, like `colorMatch`.)

### UI (`ColorIdentityFilter`)

- Add props `colorIdentityMatch?: 'atMost' | 'exact'` and
  `onColorIdentityMatchChange?: (m) => void`.
- Below the color grid, when `selected.length > 0` and the change handler is
  provided, render a radio group (reuse `styles.matchGroup`/`styles.matchOption`
  from `ColorFilter.module.css`) with two options: `At most` (`atMost`) and
  `Exactly` (`exact`). Radio `name="colorIdentityMatch"`.

### Local matcher (`filterCollectionCards.ts`)

`matchColorIdentity(cardColorIdentity, selected, mode)`:

- `selected.length === 0` → true.
- `mode === 'exact'`: card identity has the SAME set as selection —
  `identity.length === selected.length && selected.every((c) => identity.includes(c))`.
  (Colorless `{}` fails whenever selection is non-empty.)
- `mode === 'atMost'` (default): `identity.every((c) => selected.includes(c))`
  (current behavior).
  Wire the mode from `filters.colorIdentityMatch` at the call site.

### Scryfall query (`scryfall-query.ts`)

- Add `colorIdentityMatch?: 'atMost' | 'exact'` to `ScryfallQueryParams`.
- In the CI clause: `exact` → `ci=${colors}`; else `ci<=${colors}` (current).

### Search hook + page

- `SearchFilters` (`useScryfallCardSearch.ts`) gains
  `colorIdentityMatch?: 'atMost' | 'exact'`; threaded into `buildScryfallQuery`
  and into the `buildQuery` useCallback deps (primitive).
- `useSearchFiltersFromUrl.ts`: add `colorIdentityMatch` state, persisted to a new
  URL param `cim` only when `=== 'exact'` (default omitted); parsed/validated;
  added to `applyFilters`, the return object, and the effect deps.
- `search/page.tsx`: destructure `colorIdentityMatch`, pass into the official
  `useScryfallCardSearch` filters and to `<FilterModal>`.

### FilterModal

- Add `colorIdentityMatch` prop + `onApply` payload field; draft state
  `draftColorIdentityMatch`; reset to `'atMost'` in the non-backs branch; pass
  `colorIdentityMatch`/`onColorIdentityMatchChange` to `<ColorIdentityFilter>`;
  pass-through in the wrapper.

### Collection consumers

- `CollectionFiltersBar`: pass `colorIdentityMatch={filters.colorIdentityMatch}`;
  add `colorIdentityMatch: applied.colorIdentityMatch` in onApply.
- `CollectionFiltersAside`: pass `colorIdentityMatch` +
  `onColorIdentityMatchChange={(m) => patch('colorIdentityMatch', m)}` to the
  `ColorIdentityFilter`.
- `ImportSupportModals`: pass `colorIdentityMatch={state.filters.colorIdentityMatch}`
  (onApply already spreads `applied`).

### Deck finder (`CardSearchPanel.tsx`) — the subtle part

Add `colorIdentityMatch` state; feed it to `collectionFilters` and to
`scryfallFilters.colorIdentityMatch`; pass to `<FilterModal>`.

**Exact + commander intersection:** `exact` applies to the user's selection, but the
commander constraint still binds. With `exact`, the search must yield ZERO not only
when the intersection is empty (today's `userCiDisjoint`) but also when the commander
**narrows** the selection — i.e. `effectiveColorIdentity` (= user ∩ commander) is not
equal to the user's full selection. "Exactly {U,G}" is impossible if commander {W,U}
forces it to {U}. So extend the zero condition:

- Let `intersectionShrunk = colorIdentity.length !== effectiveColorIdentity.length`
  (commander removed at least one selected color; only meaningful when a commander
  constraint exists and user selected colors).
- `userCiImpossible = commanderConstraintPresent && colorIdentity.length > 0 &&
(effectiveColorIdentity.length === 0 || (colorIdentityMatch === 'exact' && intersectionShrunk))`.
- `matchNothing` uses `userCiImpossible` (replacing today's `userCiDisjoint`).
- `inCollectionCards = userCiImpossible ? [] : filteredCollectionCards` (replacing
  `userCiDisjoint`).
- When NOT match-nothing and `exact`: the Scryfall query must use `ci=` on
  `effectiveColorIdentity` (which equals the user selection in that branch, since
  no shrink), and the local `filterCollectionCards` uses `exact` on the user
  `colorIdentity`. Both agree.

Token mode: `colorIdentityFilter` is `undefined` → `userCiImpossible` false → tokens
unaffected (unchanged).

## Verification

No test framework ([[project_no_test_framework]]) — `npm run check` + runtime.
Runtime cases:

- Search, Color identity {U}, mode `Exactly`: colorless cards disappear; only
  mono-blue-identity cards remain; URL gains `cim=exact`; `At most` restores prior
  behavior; Reset clears both.
- Collection sidebar: same, mode radios appear when colors selected.
- Commander finder ({W,U} commander): `Exactly {U}` → mono-U cards only, no
  colorless, on BOTH tabs. `Exactly {U,G}` → zero on both tabs (commander shrinks
  {U,G}→{U}, exact impossible). `At most {U}` → prior behavior (includes colorless).

## Files touched

- `src/lib/search/types.ts`
- `src/lib/search/components/filters/ColorIdentityFilter/ColorIdentityFilter.tsx`
- `src/lib/card/utils/filterCollectionCards.ts`
- `src/lib/scryfall/utils/scryfall-query.ts`
- `src/lib/scryfall/hooks/useScryfallCardSearch.ts`
- `src/app/search/useSearchFiltersFromUrl.ts`, `src/app/search/page.tsx`
- `src/lib/search/components/FilterModal/FilterModal.tsx`
- `src/app/collection/lib/CollectionView/CollectionFiltersBar/CollectionFiltersBar.tsx`
- `src/app/collection/lib/CollectionView/CollectionFiltersAside/CollectionFiltersAside.tsx`
- `src/app/collection/lib/ImportModal/components/ImportSupportModals.tsx`
- `src/app/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`
- `src/lib/mpc/hooks/useCustomCards.ts` (type-satisfy literal only)
