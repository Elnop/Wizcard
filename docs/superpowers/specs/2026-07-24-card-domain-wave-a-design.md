# Card domain migration — Wave A: consumers accept domain `Card`

**Sub-project:** 1c (Card domain model refactor), migration waves.
**Date:** 2026-07-24
**Depends on:** 1c-0 foundation (domain `Card` + `CardFace`/`CardPart` + `toCard` adapter, all inert, committed at `b0b0c1b`).

## Context

The 1c-0 foundation landed a flat, provider-neutral domain `Card` type and a pure
`toCard(scryfall: ScryfallCard): Card` adapter. Both are inert — `toCard` has zero
consumers, and domain `Card` is imported only by the adapter. The app still models cards
as `ScryfallCard` everywhere: 113 files reference `ScryfallCard`, with 124 `as ScryfallCard`
casts and 167 uses of `AnyCard` (= `ScryfallCard | CardCopy | CustomCard`, defined in
`CardList/CardList.types.ts` and `filterCollectionCards.ts`).

The end-state of sub-project 1c: domain `Card` **replaces** `ScryfallCard` as the app's card
shape. `ScryfallCard` survives only in the adapter and the raw provider endpoints. The casts
disappear.

Per user decision, the migration is **two waves**, not five:

- **Wave A (this spec):** every consumer is re-typed against domain `Card`. The seam
  (`card/source`, `rowsToScryfallCard`) still returns `ScryfallCard`.
- **Wave B (next spec):** flip the seam to return `Card` (via `toCard`), delete the casts.

## Why consumer-first, seam-last

If the seam flipped first (`card/source` → `Card`), all 113 consumers would go red in tsc
simultaneously — an unreviewable big-bang. Instead we re-type consumers first. This is
**type-safe with zero runtime change**: `ScryfallCard` is structurally a superset of domain
`Card` for every field the migrated consumers read, so the _same runtime objects_ the seam
produces today remain assignable to the now-`Card`-typed consumers. Wave A cannot
runtime-regress — it only re-types. Wave B then becomes a near-no-op.

## The pivot: `AnyCard`

`AnyCard = ScryfallCard | CardCopy | CustomCard` is the single most-referenced card type
(167 uses / 40 files). Consumer sites narrow it almost entirely via **structural `'field' in
card` checks** (`'set' in card`, `'entry' in card`, `'prices' in card`, `'mana_cost' in
card`, `'power' in card`, …) plus the `isCustomCard` guard.

Field-optionality parity between `ScryfallCard` and domain `Card` (verified):

| field              | ScryfallCard | domain Card             | narrowing behaves identically |
| ------------------ | ------------ | ----------------------- | ----------------------------- |
| `set`              | required     | required                | yes                           |
| `collector_number` | required     | required                | yes                           |
| `mana_cost`        | optional     | optional                | yes                           |
| `power`            | optional     | optional                | yes                           |
| `prices`           | optional     | optional (added Wave A) | yes                           |

Because the shapes match for every narrowed field, redefining `AnyCard`'s first member from
`ScryfallCard` to `Card` keeps the 167 uses typechecking, and the `(card.set as string)`
casts after each `in`-check (present because the field is absent on `CardCopy`/`CustomCard`)
stay valid. This is what makes Wave A one mechanical sweep rather than four.

## Changes

### 1. `Card` gains `prices?`

`@/types/cards.ts`: add optional `prices?` to the domain `Card` interface, shaped like
`ScryfallPrices` (`{ usd?; usd_foil?; usd_etched?; eur?; eur_foil?; eur_etched?; tix?; }`).

`@/lib/card/adapter.ts`: `toCard` carries `s.prices` through unchanged.

**Rationale (user decision):** prices is a forward hook. The DB catalog stores no prices (1a
normalizer dropped them) and the collection route is DB-first (1b-2), so catalog cards have
no prices _today_ — display shows "—" and price-sort treats them as 0, guarded by `'prices'
in card`. Adding `prices?` to `Card` restores no current behavior; it exists so a future
price-sync feature can repopulate it, and so the adapter faithfully carries prices on the
Scryfall-fallback path (where a raw provider card still has them). Behavior is byte-identical
to today at every display/sort site.

### 2. `AnyCard` redefinition (the pivot)

Both definitions:

- `src/lib/card/components/CardList/CardList.types.ts` (exported)
- `src/lib/card/utils/filterCollectionCards.ts` (local)

`ScryfallCard | CardCopy | CustomCard` → `Card | CardCopy | CustomCard`.

`filterCollectionCards`' price-sort (`(card as ScryfallCard).prices?.usd ?? '0'` for
usd/eur/tix) is re-expressed against the widened union — either via the existing `'prices'
in card` guard pattern or a cast to `Card` — degrading to `'0'` when prices are absent,
exactly as today.

### 3. `isCustomCard` widening

`src/lib/mpc/types.ts`: `isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard`
→ `isCustomCard(card: Card | CustomCard): card is CustomCard`. The guard **body is
unchanged** — it discriminates on a `CustomCard`-only field. 12 call sites; each keeps
working because it now passes a `Card`-or-`CustomCard`. `PrintList`'s
`isCustomCard(card as ScryfallCard | CustomCard)` cast becomes `card as Card | CustomCard`.

### 4. Standalone `ScryfallCard` consumers → `Card`

~73 files type a variable/prop/store/hook directly as `ScryfallCard` (not via `AnyCard`).
Where the site reads only domain fields, re-type to `Card`. This includes the cards store
(`useCardsStore` holds `ScryfallCard` → `Card`), scryfall hooks, card/components props,
deck/collection/search/wishlist/sets/import/edhrec/pdf consumers.

**Provider-only field boundaries (isolated, not migrated to `Card`):**

- `prints_search_uri` → the multilingual Prints tab (`useCardPrints` / `getCardPrints`),
  which the ledger already froze on Scryfall (campaign decision "G2 dropped": the DB catalog
  is EN+FR only, so migrating the multilingual Prints tab would regress). The site that
  reads `prints_search_uri` keeps a narrow `ScryfallCard` at its own boundary, or the field
  is threaded as a plain `string | undefined` prop — it is NOT hoisted onto domain `Card`.
- `scryfall_uri` → card/set headers; already derived from `set`/`collector_number` in
  sub-project 1a. No `Card` field needed.

These sites are few and handled case-by-case during the sweep; they do not block the
mechanical majority.

## Explicitly out of scope (Wave B)

- `card/source` return types (`getCardById`, `getCardCollection`, …) stay `ScryfallCard`.
- `rowsToScryfallCard` stays `ScryfallCard`.
- The 124 `as ScryfallCard` casts stay (many become no-ops once the seam is `Card` in B).
- `toCard` remains uncalled by the seam (wired in B).

## Invariants / safety

- **No runtime change.** The seam still emits `ScryfallCard` objects; they remain assignable
  to the now-`Card`-typed consumers because `ScryfallCard ⊇ Card` structurally for read
  fields. Same objects, same behavior.
- **`ScryfallCard` still legitimately appears** in: the adapter, raw endpoints
  (`scryfall/endpoints`), `card/source`, `catalog-db`/`rowsToScryfallCard`, and the isolated
  provider-field boundaries (Prints tab). It is NOT globally banished in Wave A.

## Verification

- **tsc is authoritative** (type-only refactor, clean at baseline → any new tsc error is a
  regression). Gate: `npx tsc --noEmit` = 0 errors.
- `npm run check` is RED at baseline (~51 pre-existing eslint problems). Gate on **no NEW
  problems**: `npx eslint <changed files>` = clean.
- No test framework (per project constraints); runtime spot-check the migrated hot paths
  (collection list, card modal, deck detail, search) via dev server — same render as before.
- Wide-refactor commits use `git commit --no-verify` (lint-staged blocks on the RED
  baseline's pre-existing errors in any touched file). Document each time.

## Success criteria

1. `AnyCard` and every migrated standalone consumer are typed against domain `Card`.
2. `isCustomCard` accepts `Card | CustomCard`; all 12 call sites compile.
3. `Card` carries `prices?`; `toCard` populates it.
4. `card/source` / `rowsToScryfallCard` still return `ScryfallCard` (Wave B unchanged).
5. tsc: 0 errors. eslint: no new problems. Runtime hot paths unchanged.
6. Provider-only fields (`prints_search_uri`) remain isolated at their boundary, not on
   domain `Card`.
