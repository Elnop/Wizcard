# Localized card-name search — design

**Date:** 2026-07-15
**Status:** Approved, ready for implementation plan

## Problem

The card search bars only match **English** card names. A user browsing in French
(or any other language) cannot find a card by typing its localized printed name
(e.g. "Colère de Dieu" for _Wrath of God_). We want localized name matching, exposed
through a control next to both card-search bars.

## Scryfall behavior (verified against the live API)

Verified empirically against `api.scryfall.com` on 2026-07-15, cross-checked with the
[/cards/search docs](https://scryfall.com/docs/api/cards/search),
[syntax reference](https://scryfall.com/docs/syntax), and the
[multilingual announcement](https://scryfall.com/blog/announcing-multilingual-support-185):

- **`include_multilingual` defaults to `false`.** Without it, `name:"Foudre"` returns
  **404 / no match**. With `include_multilingual=true`, localized printed names match
  (28 results for "Foudre").
- **`unique` defaults to `cards`.** Under this default, a matched card is returned
  **once, in the language that matched** — searching "Colère de Dieu" returns a single
  row with `lang: fr`, `printed_name: "Colère de Dieu"`; searching "Wrath of God"
  returns the `en` print. No explicit `unique` param is needed.
- **There is no per-language name filter.** `include_multilingual` matches names across
  _all_ languages at once. The `lang:` keyword filters printed results but does not scope
  which names are matchable. Therefore the control is a binary on/off, not a language
  picker.

**Consequences for the design:**

1. The only request param to add is `include_multilingual=true`.
2. Do **not** send `unique` (default is already `cards`).
3. Do **not** add a `lang:` keyword to the query.
4. Only add the param when a name term is present, so the default popular-EDH view is
   byte-for-byte unchanged.

## Feature

A toggle labeled "Search all languages" (i18n key `search.searchAllLanguages`) beside the
search input on:

- the main `/search` page, and
- the deck-building `CardSearchPanel`.

**Behavior:**

- Toggle **on** _and_ a name term present → request adds `include_multilingual=true`.
- Toggle **off** → current behavior exactly (English-only name matching).
- Empty query → param never added regardless of toggle state; default view untouched.

**Default value:** on when `usePreferredCardLang()` is a non-English language, off when
English/unset. A French-profile user gets localized name search out of the box; English
users see no change.

## Architecture

Data flow: `includeMultilingual` (bool) → `SearchFilters` → passed through
`useScryfallCardSearch` into `searchCards({ ..., include_multilingual })` **only when a
name term is present** → Scryfall request.

### Components

**New: `SearchAllLanguagesToggle`** — `src/lib/search/components/SearchAllLanguagesToggle/`.
Controlled toggle (`value: boolean`, `onChange: (v: boolean) => void`), styled to match the
existing search-row controls (see `SearchModeSwitcher` for the pattern).

**Modified search rows:**

- `src/app/[locale]/search/page.tsx`
- `src/app/[locale]/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`

### State plumbing

- `SearchFilters` (in `src/lib/scryfall/hooks/useScryfallCardSearch.ts`) gains optional
  `includeMultilingual?: boolean`.
- `useScryfallCardSearch`:
  - `ScryfallSearchParams.include_multilingual` already exists (`src/lib/scryfall/types/api.ts:16`)
    and `searchCards` already forwards it (`src/lib/scryfall/endpoints/cards.ts:26`), so the
    hook only needs to pass it into `searchCards` — gated on a non-empty name term.
  - Include the flag (and whether a name term is present) in the effect's `searchKey` so
    toggling re-fires the search.
- **Main `/search` page:** flag added to `useSearchFiltersFromUrl`, persisted as a URL param
  (e.g. `?ml=1`) alongside the other filters.
- **Deck panel:** local `useState`, no URL persistence (transient panel).

### Default value derivation

Map `usePreferredCardLang()` to on/off: `undefined` or `en` → off; anything else → on.
Applied as the initial toggle state in both call sites.

### i18n

Add `search.searchAllLanguages` (label + aria) to the message catalogs (`messages/*.json`).

## Testing

Per project convention (no test framework — [[project_no_test_framework]]): `npm run check`
plus runtime verification.

- Toggle **on**, type "Colère de Dieu" → returns _Wrath of God_ (verified against live API).
- Toggle **off** → English-only matching unchanged.
- Empty query → popular-EDH default view unchanged in both toggle states.
- Deck `CardSearchPanel` behaves identically to the main page.

## Out of scope

- Per-language name filtering (Scryfall has no such capability).
- Changing which language _images_ display in (already handled by the existing
  `usePreferredCardLang` / localized-image path).
- Custom-card (`useCustomCards`) and cardback search — these are local DB queries, not
  Scryfall, and are unaffected.
