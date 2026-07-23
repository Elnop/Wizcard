# Card domain type foundation — sub-project 1c-0

**Date**: 2026-07-24
**Status**: Design approved, ready for planning

## Context and goal

The long-standing "Card domain model refactor" goal: the app should manipulate a
provider-neutral **Card** type (a Magic card), with Scryfall relegated to an adapter —
instead of coupling 112 files directly to `ScryfallCard` (with 104 `as ScryfallCard`
casts). The end state: the domain `Card` **replaces** `ScryfallCard` as the app's card
shape; `ScryfallCard` survives only in the adapter/endpoints (the provider's raw form).

That is far too large for one spec (112 files), so it is decomposed:

| #        | Sub-project                                                                                       | Content                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **1c-0** | **Type foundation (this spec)**                                                                   | Rename the existing `Card` → `CardCopy`; define the new provider-neutral domain `Card` + a `toCard` adapter. No consumer migrated. |
| 1c-1..n  | Migrate consumers (by zone) from `ScryfallCard`/`AnyCard` to the domain `Card`; remove the casts. | later                                                                                                                              |

This spec (1c-0) is the isolated, tsc-verifiable foundation.

## The naming collision (why rename first)

Today `@/types/cards.ts` defines:

```ts
export interface CardEntry { rowId; dateAdded; isFoil?; condition?; language?; …; deckId?; ownerId?; wishlist? }  // per-copy inventory metadata
export type Card = (ScryfallCard | CustomCard) & { entry: CardEntry };  // an OWNED copy = card data + its entry
export interface CardStack { oracleId; name; cards: Card[] }             // copies sharing an oracle_id
```

So the existing `Card` is a **possessed copy** (card + inventory entry), and `CardEntry` is
already the inventory metadata. The domain-`Card` name is taken, and `CardEntry` is taken
by something else. The chosen resolution (matches the code's own comment "One copy in the
collection = Scryfall print data + per-copy metadata"):

- Existing `Card` (possessed copy) → **`CardCopy`**.
- `CardEntry` (inventory metadata) → **unchanged**.
- The freed name **`Card`** → the new provider-neutral domain type.
- `ScryfallCard` → unchanged (provider raw form, stays in endpoints/adapter).

## Design

### Change 1 — rename `Card` → `CardCopy`

In `@/types/cards.ts`:

```ts
// before
export type Card = (ScryfallCard | CustomCard) & { entry: CardEntry };
export interface CardStack { …; cards: Card[]; }
// after
export type CardCopy = (ScryfallCard | CustomCard) & { entry: CardEntry };
export interface CardStack { …; cards: CardCopy[]; }
```

Then update every importer of `Card` **from `@/types/cards`** (~34 files import from this
module; ~18 name `Card` specifically) to `CardCopy`, plus the `AnyCard` union
(`ScryfallCard | Card | CustomCard` → `ScryfallCard | CardCopy | CustomCard`, in
`CardList.types.ts` and `filterCollectionCards.ts`) and any `CardStack.cards` access.

**Rename discipline (critical):** rename ONLY the `Card` symbol that comes from
`@/types/cards`. Do NOT touch other `Card*` identifiers — `CardEntry`, `CardStack`,
`CardCondition`, `ScryfallCard`, `CustomCard`, `CardModal`, `CardImage`, `CardList`,
`CardData`, component names, CSS classes, etc. The safe mechanical approach is per-file:
find the `import … { … Card … } from '@/types/cards'`, rename that imported binding, then
fix its uses in that file. `CardCopy` does not currently exist as a type (verified) — no new
collision. `tsc` is the safety net: after the rename, `npx tsc --noEmit` must be clean (any
missed reference to the old `Card` type breaks the build).

### Change 2 — define the domain `Card` + `toCard` adapter

In `@/types/cards.ts` (per decision: all card vocabulary lives here), add the new domain
`Card` — **flat**, provider-neutral, only the ~40 fields the app actually reads, with the
same field names as today (so future consumer migration is a near-drop-in), and **without**
provider-specific fields (`scryfall_uri`, `prints_search_uri`, `uri`, `rulings_uri`, set
URIs). Measured field usage drove this set. Shape (names kept flat for migration ease):

```ts
export interface Card {
	// identity
	id: string; // the print id (was ScryfallCard.id)
	oracle_id: string;
	name: string;
	lang: string;
	layout: string;
	// gameplay
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	cmc?: number;
	colors?: string[];
	color_identity?: string[];
	keywords?: string[];
	power?: string;
	toughness?: string;
	loyalty?: string;
	legalities?: unknown; // format→legality map (kept opaque here)
	reserved?: boolean;
	edhrec_rank?: number;
	// print
	set: string;
	set_name?: string;
	collector_number: string;
	rarity?: string;
	released_at?: string;
	artist?: string;
	frame?: string;
	border_color?: string;
	image_status?: string;
	image_uris?: { small: string; normal: string; large: string };
	finishes?: string[];
	foil?: boolean;
	nonfoil?: boolean;
	promo?: boolean;
	reprint?: boolean;
	variation?: boolean;
	digital?: boolean;
	// localized
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
	// multi-face + relations
	card_faces?: CardFace[];
	all_parts?: CardPart[];
	// external ids (occasionally read)
	multiverse_ids?: number[];
	mtgo_id?: number;
	arena_id?: number;
	tcgplayer_id?: number;
	cardmarket_id?: number;
}
```

`CardFace` and `CardPart` are small flat shapes mirroring the face/part data the app reads
(name/type_line/oracle_text/image_uris/printed_* for faces; component/name/type_line/id for
parts) — the plan will pin their exact fields from the current `ScryfallCardFace`/
`ScryfallRelatedCard` usage. The exact field list is finalized in the plan against the
measured reads; this is the shape, not the last word on every optional.

`prices` is intentionally **omitted** from the domain `Card` (volatile, not in our catalog,
provider-specific) — consumers that show prices keep reading it from a Scryfall object /
their own source; that is a migration-time decision, out of scope for the foundation.

**`toCard(scryfall: ScryfallCard): Card`** — a pure adapter (modeled on the existing
`toCustomCard`), in a module the plan picks (e.g. `src/lib/card/adapter.ts`). It copies the
mapped fields from a `ScryfallCard` to a domain `Card`, deriving `foil`/`nonfoil` from
`finishes` if needed. It has **no consumers yet** — it is the seam the later migration waves
use to feed the app domain `Card`s.

### Nothing is migrated

The new `Card` type and `toCard` are used by nobody in this spec. The 112 `ScryfallCard`
references and the `AnyCard` unions still use `ScryfallCard`. This spec only: renames the old
`Card`, frees the name, and lands the domain type + adapter as a tested foundation.

## Scope

**In scope**

- Rename `Card` → `CardCopy` in `@/types/cards.ts` + all importers + `AnyCard` + `CardStack`.
- Define the domain `Card` (flat, provider-neutral) + `CardFace`/`CardPart` in `@/types/cards.ts`.
- `toCard(scryfall): Card` pure adapter.

**Out of scope (later 1c waves)**

- Migrating the 112 `ScryfallCard` consumers / the `AnyCard` unions to the domain `Card`
  (removes the casts) — done zone by zone.
- Redefining `CardCopy` as `(Card | CustomCard) & { entry }` (uses the domain instead of
  `ScryfallCard`) — a later wave once the adapter feeds the app.
- The DB assembler (`rowsToScryfallCard`) producing a domain `Card` directly — later.
- Prices in the domain type.

## Verification

No test framework (project convention) — verify via `npm run check` + tsc:

- **Rename**: after `Card → CardCopy`, `npx tsc --noEmit` is clean (any leftover reference to
  the old possessed-`Card` type is a compile error — the definitive check). `grep -rn "Card\b"
… from '@/types/cards'` shows importers use `CardCopy`, not the old `Card`. No unrelated
  `Card*` identifier was renamed (spot-check `CardEntry`/`CardStack`/`CardModal` intact).
- **Domain type + adapter compile**: `Card`, `CardFace`, `CardPart`, `toCard` type-check.
  `toCard(aScryfallCard)` returns a `Card` with the mapped fields (a throwaway tsx spot-check
  on one real card object, or a type-level check — no runtime consumer yet).
- **No behavior change**: nothing is wired to the new type, so the app runs exactly as before
  (the rename is type-only; `CardCopy` is structurally identical to the old `Card`).
- `npm run check`: no NEW problems in changed files beyond baseline.
