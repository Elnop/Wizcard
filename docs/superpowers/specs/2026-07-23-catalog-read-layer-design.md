# Catalog read layer (DB → ScryfallCard) — sub-project 1a

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

Sub-project 0 mirrored the Scryfall catalog into local tables (`card_definitions`,
`card_prints`, `card_definition_faces`, `card_print_faces`, `card_parts`), seeded EN+FR
paper cards. But **nothing in the app reads it yet** — the card page still calls
`getCardById(id)` → `api.scryfall.com` on every render, and every deterministic card
lookup goes to the rate-limited API.

This sub-project introduces the **read layer**: deterministic card lookups served from
the DB, with a Scryfall fallback, so the app stops depending on the live API for
key-based access. Per the product direction: **everything that does not require a
Scryfall service should read from the DB first** (id/set-number/lang lookups, batch
collection loads, import name-matching, list data). **Search stays on Scryfall** — it is
a complex Scryfall system we are not reimplementing now.

This is the first, bottom-up slice of the larger "Card domain model refactor": the
domain `Card` type is deferred. Here the read layer returns objects **shaped like
`ScryfallCard`** so existing consumers (which already expect that shape) need no change.
A real provider-neutral `Card` type comes in a later sub-project.

### Roadmap position

| #      | Sub-project                                   | State |
| ------ | --------------------------------------------- | ----- |
| 0      | Card catalog mirror (tables + seed)           | done  |
| **1a** | **Catalog read layer (this spec)**            | —     |
| 1b+    | Migrate remaining consumers to the read layer | later |
| 1c     | Provider-neutral `Card` domain type           | later |
| 2      | Freshness / incremental re-seed               | later |
| 3      | Pre-generated SSR / page cache                | later |

## Architecture — two layers

```
consumers (card page, lists, import…)
        │  call
        ▼
┌──────────────────────────────────────────────┐
│  card-source  (orchestrator)                  │  ← fallback lives HERE
│  getCardById(id) = catalogDb.byId(id)         │
│                    ?? scryfall.getCardById(id) │
└──────────────────────────────────────────────┘
        │ DB first                 │ miss (null) → Scryfall
        ▼                          ▼
┌──────────────────────┐   ┌───────────────────────┐
│  catalog-db (PURE)   │   │  scryfall/endpoints   │
│  byId / bySetNumber  │   │  (existing, unchanged)│
│  byCollection / …    │   └───────────────────────┘
│  → ScryfallCard|null │
│  (no Scryfall / no   │
│   fallback knowledge)│
└──────────────────────┘
        │ reads
        ▼
  card_definitions + card_prints + faces
        │ via the assembler rowsToScryfallCard()
```

Two distinct modules, deliberately separated:

- **`catalog-db`** (pure): DB lookups returning `ScryfallCard | null`. Knows nothing
  about Scryfall or fallback. Contains the assembler. Trivially reasoned about and
  isolated.
- **`card-source`** (orchestrator): same signatures as today's Scryfall endpoint
  functions; tries `catalog-db` first, falls back to the existing Scryfall endpoint on
  `null`. This is what consumers migrate to. The fallback strategy lives here, not in the
  reader.

## Module 1 — `catalog-db` (pure DB reader)

New module, e.g. `src/lib/card/catalog-db/`. Server-side (uses the Supabase server
client). Every lookup returns `ScryfallCard | null` (null = not in the catalog).

### Lookups

| Function                                                                 | DB key                                                         | Replaces (Scryfall)         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------- |
| `byId(id)`                                                               | `card_prints.id`                                               | `getCardById`               |
| `bySetNumber(set, n)`                                                    | `(set, collector_number)`, `lang='en'`                         | `getCardBySetNumber`        |
| `bySetNumberLang(set, n, lang)`                                          | `(set, collector_number, lang)`                                | `getCardBySetNumberAndLang` |
| `byCollection(identifiers[])`                                            | batch of keys (id or set+number) in ONE query, order preserved | `getCardCollection`         |
| `byName(name, opts?)`                                                    | `card_definitions.name` → chosen print                         | `getCardByName`             |
| `printsByOracleId(oracle_id)`                                            | all `card_prints` of an oracle                                 | `getCardPrints`             |
| `byMultiverseId / byMtgoId / byArenaId / byTcgplayerId / byCardmarketId` | external-id columns (added by the catalog migration below)     | the 5 external-id lookups   |

Notes:

- **`byName(name, opts?)`**: a name → an `oracle_id` (via `card_definitions.name`) → a
  chosen print. Default = the **most recent EN print** (`lang='en'`, max `released_at`,
  tie-break by `set`/`collector_number` — implementer's choice for a stable order).
  `opts` allows overriding (e.g. `{ lang }`) to target another print, mirroring how the
  app may want a specific language. Exact-name only — fuzzy name matching stays on
  Scryfall.
- **`byCollection`**: the most valuable for lists (loading 50–200 cards at once). Takes
  N heterogeneous identifiers (some by id, some by set+number), does one grouped DB read,
  and returns results in the input order (like Scryfall's `/cards/collection`). A missing
  identifier yields a null slot (the orchestrator fills it via fallback).
- **`multiverse_ids` is an array**; the other external ids are scalars and are per-print
  (verified: they differ EN vs FR, and are often null in FR).

### The assembler `rowsToScryfallCard`

The inverse of the seed's `toCatalogRows`. Given `(definition, print, definitionFaces[],
printFaces[])`, reconstruct a `ScryfallCard`:

- gameplay fields (`name`, `type_line`, `oracle_text`, `mana_cost`, `cmc`, `colors`,
  `color_identity`, `keywords`, `legalities`, `power/toughness/loyalty/defense`,
  `reserved`, `edhrec_rank`, `layout`) ← `definition`.
- print fields (`id`, `set`, `collector_number`, `lang`, `rarity`, `released_at`,
  `artist`, `border_color`, `frame`, `image_status`, `image_uris`, `finishes`, `promo`,
  `reprint`, `variation`, `digital`, `printed_name/type_line/text`, external ids) ←
  `print`.
- **`card_faces[]`** ← re-fuse per `face_index`: `definitionFaces[i]` (gameplay:
  name/type_line/oracle_text/mana_cost/colors/power/toughness/loyalty) + `printFaces[i]`
  (artist/illustration_id/`image_uris`/`printed_*`) → one `ScryfallCardFace`. When a card
  has no faces (mono-face), `card_faces` is omitted, matching Scryfall.
- **Split vs DFC distinction is preserved**: `printFaces[i].image_uris` is null for a
  shared-image split/adventure/flip face (image is on the print root) and non-null per
  face for a flippable DFC. The assembler carries that through, so downstream
  `computeIsDoubleFaced`-style logic keeps working exactly as with a live Scryfall object.

### Partial reconstruction (known, intentional)

A reconstructed `ScryfallCard` is **partial**: fields the catalog does not store are
left `undefined` — notably `prices`, `rulings_uri`, `related_uris`, `purchase_uris`,
`scryfall_uri`/`uri`, `prints_search_uri`, `set_*` URIs. Consumers needing those (the
Rulings tab, price display) keep their own Scryfall call — and rulings/search are out of
scope here anyway. This must be documented so no consumer assumes a full object.

## Module 2 — `card-source` (orchestrator)

New module, e.g. `src/lib/card/source/`. Exposes functions with the SAME signatures as
the Scryfall endpoint functions they shadow (so a consumer swaps its import and nothing
else). Each:

1. calls the matching `catalog-db` lookup,
2. on a non-null result → returns it (zero Scryfall traffic),
3. on `null` (structural miss: card not in the catalog — non-paper, a set newer than the
   last re-seed, etc.) → calls the existing Scryfall endpoint. Behavior never regresses.

`byCollection`'s orchestrator resolves the null slots via a single batched Scryfall
`getCardCollection` for the misses, then merges back in input order — so a mostly-cached
list makes at most one small Scryfall call for the stragglers.

## Catalog migration — external IDs

Amend `card_prints` (a new migration; the catalog tables are not in prod yet, but this is
an additive change so a normal `add column if not exists` migration is used, not an
in-place edit of the create migration):

- `multiverse_ids int[]`
- `mtgo_id int`
- `arena_id int`
- `tcgplayer_id int`
- `cardmarket_id int`

(All per-print, nullable — verified against the API: present in EN, usually null in FR.)
Then extend `normalize-catalog-card.ts` (`CardPrintRow` + the print row builder) to read
these from the Scryfall object, and **re-seed** locally. This unblocks the 5 external-id
lookups. `mtgo_foil_id`/`tcgplayer_etched_id` are omitted (unused; add later if needed).

## Pilot consumer — the card page

To prove the chain end-to-end, migrate ONE consumer in this spec: the card detail page
`src/app/[locale]/card/[id]/page.tsx`. Its two `getCardById(id)` calls (in
`generateMetadata` and the page body) switch from `@/lib/scryfall/endpoints/cards` to
`card-source`'s `getCardById`. The page keeps passing a `ScryfallCard`-shaped object to
`CardPageHeader`/`CardTabs` — unchanged, because the shape is identical. Result: the card
page renders from the DB, hitting Scryfall only for cards absent from the catalog.

The card page's tabs that need non-catalog data (Rulings, prices) keep their own Scryfall
calls — out of scope here.

## Scope

**In scope**

- `catalog-db` pure reader: the 6 deterministic lookups + 5 external-id lookups + the
  `rowsToScryfallCard` assembler.
- `card-source` orchestrator: DB-first with Scryfall fallback, same signatures.
- Catalog migration adding external-id columns + normalizer change + local re-seed.
- Migrate the card page (`card/[id]/page.tsx`) as the pilot consumer.

**Out of scope (later)**

- Search: `searchCards`/`searchAllCards`/`countCardSearch`, `getCardSimilar`,
  `autocompleteCards`, `randomCard`, `fuzzySearchCard` — stay on Scryfall.
- `getCardRulings` — rulings are not in the catalog (separate Scryfall bulk).
- Prices — not stored (volatile).
- The provider-neutral `Card` domain type — the read layer returns `ScryfallCard` shape
  for now.
- Migrating the other ~48 `ScryfallCard`-consuming files — later 1b specs.
- Prod re-seed / migration apply — operational, tracked separately.

## Verification

No test framework (project convention) — verify via `npm run check` + runtime + psql:

- `catalog-db` lookups return a correctly-shaped `ScryfallCard` for known cards (spot-check
  a mono-face, a DFC with per-face images, a split with root image, an FR print with
  `printed_name`), and `null` for a card absent from the catalog.
- `rowsToScryfallCard` re-fuses faces correctly: a DFC yields `card_faces[2]` each with
  its own `image_uris`; a split yields `card_faces[2]` whose faces have no `image_uris`.
- External-id migration applies from scratch; re-seed populates the new columns; the 5
  external-id lookups resolve a known card (e.g. `dsk/1` EN by its `multiverse_id`).
- `card-source`: a catalog hit makes zero Scryfall calls; a miss falls back and still
  returns a card (never a regression).
- Card page renders from the DB for a catalog card; still renders (via fallback) for a
  non-catalog card. `npm run check` shows no NEW problems in changed files.
