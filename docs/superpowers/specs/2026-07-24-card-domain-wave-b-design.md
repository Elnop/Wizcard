# Card domain migration — Wave B: the seam emits domain `Card`

**Sub-project:** 1c (Card domain model refactor), migration waves.
**Date:** 2026-07-24
**Depends on:** Wave A (commits `9f71812..775d8b0`) — every consumer already speaks domain
`Card`; `AnyCard` and `CardCopy` are `Card`-based; tsc clean at 0.

## Context

Wave A re-typed the app's consumers onto domain `Card` while the seam kept returning
`ScryfallCard`. That was safe because `ScryfallCard` is structurally assignable to `Card`
(probe-verified), so the seam's richer objects flowed into `Card`-typed consumers unchanged.

Wave B closes the loop: the seam itself now produces `Card`. After this, `ScryfallCard`
describes only what it should — data as the provider actually sends it.

## Why this is small

The seam has exactly **two consumers**, both already `Card`-ready:

- `src/app/[locale]/card/[id]/page.tsx` → `getCardById`
- `src/app/api/scryfall/cards/collection/route.ts` → `getCardCollection` (JSON-serializes the
  result straight to the client)

And every `card/source` function is a one-liner of the form `db.x() ?? scry.x()`. Because
`ScryfallCard` is assignable to `Card`, changing the declared return type to `Card` makes
**both arms typecheck with no code change** — the DB arm already produces domain-shaped data,
and the Scryfall-fallback arm's extra fields are simply not visible through the `Card` type.

## The real substance: the assembler stops fabricating

`rowsToScryfallCard` (`src/lib/card/catalog-db/assembler.ts`) currently invents values to
satisfy `ScryfallCard`'s **required** fields, because the DB columns are nullable:

| assembled as               | why it exists                       | on domain `Card`  |
| -------------------------- | ----------------------------------- | ----------------- |
| `object: 'card'`           | no such DB column at all            | field not on Card |
| `released_at ?? ''`        | `ScryfallCard.released_at` required | optional          |
| `cmc ?? 0`                 | required                            | optional          |
| `type_line ?? ''`          | required                            | optional          |
| `rarity ?? 'common'`       | required                            | optional          |
| `border_color ?? 'black'`  | required                            | optional          |
| `frame ?? '2015'`          | required                            | optional          |
| `image_status ?? 'lowres'` | required                            | optional          |
| `legalities ?? {}`         | required                            | optional          |
| `color_identity ?? []`     | required                            | optional          |
| `layout ?? 'normal'`       | required                            | optional          |

Each `??` is a claim the data does not support: a card whose rarity is unknown is reported as
`common`, an unknown frame as `2015`. On domain `Card` these fields are optional, so the
assembler can pass `undefined` through and tell the truth.

**Risk assessment (measured, not assumed).** Against the seeded local catalog
(159 045 prints / 35 018 definitions) every one of these columns is **non-NULL in 100 % of
rows** — the only genuinely-NULL column is `colors` (571 colorless definitions), which the
assembler already maps to `undefined`. So today these defaults are dead branches and removing
them is a **truthfulness cleanup with no observable runtime change**. It matters for future
data (a partial seed, a new column, a provider gap), where the app would otherwise silently
display invented values.

## Changes

### 1. `rowsToScryfallCard` → `rowsToCard`, returning `Card`

Rename and re-type. Drop `object`. Replace each fabricated default with the honest value:
`print.rarity ?? undefined`, `print.frame ?? undefined`, `print.border_color ?? undefined`,
`def.cmc ?? undefined`, `def.type_line ?? undefined`, `print.released_at ?? undefined`,
`print.image_status ?? undefined`, `def.legalities ?? undefined`, `def.layout ?? undefined`,
`def.color_identity ?? undefined`.

`layout` is required on `Card` (`layout: string`); if it must stay required, keep
`?? 'normal'` **only** for that one field and note it — otherwise make it optional. Decide by
what tsc reports; do not widen `Card` for this.

The per-face builder (`buildFaces`) returns domain `CardFace[]` (it already produces the same
field set).

The `as ScryfallLayout` / `as ScryfallRarity` / `as ScryfallBorderColor` / `as ScryfallFrame` /
`as ScryfallColors` / `as ScryfallLegalities` casts disappear — domain `Card` types these as
`string` / `MtgColor[]` / `Record<string,string>`, which the DB rows satisfy directly.

### 2. `catalog-db` returns `Card`

All lookups (`byId`, `bySetNumber`, `bySetNumberLang`, `byName`, `byMultiverseId`, `byMtgoId`,
`byArenaId`, `byTcgplayerId`, `byCardmarketId`, `byCollection`, `printsByOracleId`) change
`Promise<ScryfallCard | null>` → `Promise<Card | null>` (and `ScryfallCard[]` → `Card[]`).
Bodies unchanged apart from the assembler call.

### 3. `card/source` returns `Card`

All nine single-card functions → `Promise<Card>`; `getCardCollection` →
`Promise<ScryfallList<Card>>`. Bodies unchanged: `db.x() ?? scry.x()` still typechecks because
`ScryfallCard` is assignable to `Card`.

`ScryfallList<T>` is generic, so `ScryfallList<Card>` needs no new type. The `not_found`
member stays `ScryfallCardIdentifier[]` — that is request-protocol data, not card data.

### 4. Client `getCardCollection` → `ScryfallList<Card>`

`src/lib/scryfall/endpoints/cards.ts`'s `getCardCollection` is typed
`ScryfallList<ScryfallCard>` but calls a **proxied** endpoint (`PROXIED_ENDPOINTS` contains
`/cards/collection`) that our DB-first route serves. Its result is therefore domain-shaped in
the common case and provider-shaped only on fallback — `Card` is the honest type for both,
since the fallback's extra fields are a superset.

The other `endpoints/cards.ts` functions (`getCardById`, `getCardPrints`, `getCardSimilar`'s
return, search) keep `ScryfallCard`: they hit real Scryfall directly and genuinely return
provider data.

## Explicitly out of scope

- **The prints subsystem** (`useCardPrints`, `PrintList`, `PrintList.types`,
  `CardPrintPickerModal`, `UseCollectionCopyModal`, `ImportPreview`'s print flow) stays on
  `ScryfallCard`. It is deliberately frozen on Scryfall (campaign decision "G2 dropped": the
  catalog is EN+FR only, so a DB migration would lose the multilingual prints the tab exists
  to show). Its data really is raw provider output.
- `scryfall/endpoints/*` beyond item 4, `scryfall/types/*`, and the `CustomCard` base
  (`Omit<Partial<ScryfallCard>,'object'>`) are unchanged.
- `resolveCardsByScryfallIds`'s internal `fetched: ScryfallCard[]` network buffer and
  `localizeTokens`' `fetchLocalized` dep stay `ScryfallCard` — genuine provider buffers.
- No new provider fields are hoisted onto domain `Card`.

## Invariants / safety

- **Wire compatibility.** The collection route JSON-serializes whatever the seam returns. The
  only wire-visible change is that a few keys that were previously invented (`object`, and any
  default that would have fired) are now absent. Since those columns are never NULL in the
  catalog, the serialized payload is unchanged for every card currently in the DB, except that
  `object: 'card'` disappears. **Verify no client reads `.object` off a collection response** —
  `isCustomCard` discriminates on `'custom' in card` (Wave A), so it does not.
- **Fallback path unchanged.** Scryfall-sourced objects still carry every provider field at
  runtime; only the static type narrows.
- **No consumer change expected.** Both seam consumers already accept `Card`.

## Verification

- **tsc is authoritative**: `npx tsc --noEmit` = 0 (baseline 0). Any new error is a regression.
- **eslint gate = no NEW problems.** `npm run check` sits at exactly 51 pre-existing problems,
  all in untouched files. Gate via `npx eslint <changed files>` (null-delimited — paths contain
  `[locale]`, which the shell glob-expands).
- **`as unknown as` must not increase.** Count is **12**; Wave B must end ≤ 12. The Wave A
  lesson stands: when TypeScript suggests "convert the expression to 'unknown' first", that
  suggestion is the trap — migrate the signature instead.
- **Runtime proof (required, this is the wave that changes emitted data):**
  - card page `/en/card/<uuid>` and `/fr/card/<uuid>` render 200 with the correct title;
  - the collection route returns a card whose JSON no longer contains `"object":"card"` but
    still carries name/set/collector_number/image_uris;
  - a Scryfall-fallback card (an id absent from the catalog) still resolves.
- No test framework exists — tsc + eslint + the runtime checks above are the evidence.
- Commits use `git commit --no-verify` (lint-staged blocks on the RED baseline).

## Success criteria

1. `rowsToCard` returns `Card`, fabricates nothing, and carries no provider-type casts.
2. `catalog-db` and `card/source` return `Card` / `ScryfallList<Card>`.
3. Client `getCardCollection` returns `ScryfallList<Card>`.
4. tsc 0; eslint no new problems; `as unknown as` ≤ 12.
5. Runtime: card page + collection route + a fallback card all verified working.
6. `ScryfallCard` remains only where the data is genuinely the provider's: raw endpoints, the
   frozen prints subsystem, the `CustomCard` base, and internal network buffers.
