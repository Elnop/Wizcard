# Card catalog mirror — sub-project 0

**Date**: 2026-07-23
**Status**: Design approved, ready for planning

## Context and goal

The long-term objective is a large optimization of card-data retrieval: pre-render
card pages server-side and remove the dependency on Scryfall's live API (rate limit,
latency, single point of failure). Today the card detail page (`src/app/[locale]/card/[id]/page.tsx`)
is a server component that calls `getCardById(id)` → `api.scryfall.com` on **every**
render.

The prerequisite — this sub-project — is to **mirror the Scryfall card data we need
into our own database**, modeled as proper domain tables, so downstream sub-projects
can read from the DB instead of the API.

### Roadmap (this spec is sub-project 0)

| #     | Sub-project                                              | Depends on |
| ----- | -------------------------------------------------------- | ---------- |
| **0** | **Card catalog mirror (tables + seed)** — this spec      | —          |
| 1     | Read from DB instead of API (card page, search, prints…) | 0          |
| 2     | Freshness / incremental re-seed                          | 0          |
| 3     | Pre-generated SSR / page cache                           | 1          |

Sub-projects 1–3 each get their own spec → plan → implementation cycle. This spec
covers **only** the schema, the rename, and the seed.

## Data model

The Scryfall data has a natural three-level identity structure (verified against the
live API on 2026-07-23):

```
definition (gameplay identity — the "concept" of a card)
  │  oracle_id · name · type_line · oracle_text · cmc · colors · color_identity
  │  keywords · legalities · power/toughness/loyalty/defense · layout
  │  → INVARIANT across language and edition. "Lightning Bolt" = 1 definition.
  │
  └─ print (one physical edition × language: set + collector_number + lang)
        │  set · collector_number · lang(en|fr) · rarity · artist · frame · border
        │  released_at · finishes · image_status · image_uris · printed_* (localized)
        │  → 1 definition has N prints (each reprint × each language).
        │
        └─ faces (0..2) split by nature: gameplay in card_definition_faces
           (per oracle, invariant), visual+localized in card_print_faces (per print)

parts — all_parts relations, modeled oracle → oracle (token / meld_part /
        meld_result / combo_piece). A token is itself a full definition+print;
        parts stores only the edge between two definitions.
```

### Key API facts that shaped the model (verified 2026-07-23)

- **`oracle_id` is shared across all reprints** of a card (64 prints of "Lightning Bolt",
  same `oracle_id`) → confirms definition 1→N prints.
- **`oracle_id` is at the card level, not per face** (DFC faces report `oracle_id: null`;
  `type_line`/`mana_cost`/`colors`/`oracle_text` ARE per face). Gameplay identity is
  keyed by the root `oracle_id`.
- **EN and FR prints of the same physical card share `set`, `collector_number`, and
  `oracle_id`, but have distinct print `id` and differing `image_status`/`printed_name`.**
  So (set, collector_number, **lang**) uniquely identifies a print row; EN and FR are
  two rows pointing at the same `card_definitions`.
  - Verified: `dsk/1` EN id `6f1a7590…` (highres, printed_name null) vs FR id `54ec741c…`
    (lowres, printed_name "Cheerleader acrobatique"), both `oracle_id d8ce3f18…`,
    both `collector_number 1`.
- **`reversible_card` layout** exists and is NOT in our current `ScryfallLayout` type
  (image_uris per face, no root image_uris).
- **split / adventure / flip**: root `image_uris` (one physical image) but `printed_*`
  live per `card_face` (top-level `printed_*` is null). This is why per-face printed
  fields must be captured.
- **`all_parts`** entries are `{component, name, type_line, id}` where `id` is a **print
  id** (not oracle_id). The list often includes the card itself as `combo_piece`.

### Why EN + FR live at the print level (not duplicated gameplay)

`card_prints` carries rows for `lang='en'` AND `lang='fr'`. This does **not** duplicate
gameplay data: `oracle_text`, oracle `type_line`, `cmc`, `colors`, `keywords`,
`legalities` all live in `card_definitions` and are referenced by `oracle_id`. What
differs between the EN and FR print rows is only edition/localization data: the image
(`image_uris`, localized per language), `image_status`, and the printed_* strings.
`localized_cards` (the previous localized-image cache) is therefore **absorbed** into
this model — an FR localization is just a `card_prints` row with `lang='fr'` plus its
`card_definition_faces` + `card_print_faces`.

## Tables

Naming is provider-neutral (no `scryfall` in table names) and avoids overloading the
word `cards`. The link to Scryfall is kept in **column** names (`oracle_id`) only.

### `card_entries` — existing table, renamed from `cards`

The current `cards` table (user-owned cards: deck/collection/wishlist entries, with
`user_id`, `owner_id`, `deck_id`, `zone`, `wishlist`, `for_trade`, `scryfall_id`,
`condition`, `foil_type`, constraint `cards_owner_or_deck`) is renamed to
`card_entries` — each row is one occurrence of a card in a deck or a collection.

This rename touches ~58 SQL references across migrations, 12 `.from('cards')` call
sites in TS (`src/lib/supabase/queries/decks.ts`, `src/lib/collection/db/collection.ts`,
`src/lib/supabase/queries/cards.ts`), plus RLS policies, FK constraints, and named
constraints. It is done as the **first, isolated step** of the implementation plan and
verified (`npm run check` + runtime) before any new table is created.

### `card_definitions` — gameplay identity (oracle level)

PK `oracle_id`. ~30k rows.

| column                             | type        | note                                         |
| ---------------------------------- | ----------- | -------------------------------------------- |
| oracle_id                          | uuid        | PK                                           |
| name                               | text        | oracle name (EN reference)                   |
| type_line                          | text        |                                              |
| oracle_text                        | text        |                                              |
| mana_cost                          | text        |                                              |
| cmc                                | numeric     |                                              |
| colors                             | text[]      | {W,U,B,R,G}                                  |
| color_identity                     | text[]      |                                              |
| keywords                           | text[]      |                                              |
| power, toughness, loyalty, defense | text        | Scryfall serves these as strings             |
| legalities                         | jsonb       | {standard:legal, modern:legal, …}            |
| reserved                           | boolean     |                                              |
| edhrec_rank                        | int         | nullable                                     |
| layout                             | text        | normal\|transform\|split\|reversible_card\|… |
| updated_at                         | timestamptz | default now()                                |

### `card_prints` — physical edition, per language (EN + FR)

PK `id` (Scryfall print id, distinct per language). FK `oracle_id → card_definitions`.

| column                             | type        | note                                       |
| ---------------------------------- | ----------- | ------------------------------------------ |
| id                                 | uuid        | PK (Scryfall print id)                     |
| oracle_id                          | uuid        | FK → card_definitions(oracle_id)           |
| set                                | text        |                                            |
| collector_number                   | text        |                                            |
| lang                               | text        | CHECK (lang in ('en','fr'))                |
| rarity                             | text        |                                            |
| released_at                        | date        |                                            |
| artist                             | text        |                                            |
| border_color, frame                | text        |                                            |
| image_status                       | text        | lowres\|highres_scan\|placeholder\|missing |
| image_uris                         | jsonb       | {small,normal,large} — localized per lang  |
| finishes                           | text[]      | {nonfoil,foil,etched}                      |
| promo, reprint, variation, digital | boolean     |                                            |
| printed_name                       | text        | localized (null in EN)                     |
| printed_type_line                  | text        | localized                                  |
| printed_text                       | text        | localized                                  |
| updated_at                         | timestamptz | default now()                              |
|                                    |             | UNIQUE (set, collector_number, lang)       |

Indexes: `(oracle_id)`, unique `(set, collector_number, lang)`.

### Faces: `card_definition_faces` + `card_print_faces`

Scryfall's Card Face object mixes three natures (verified against the official docs):
gameplay (`name`, `type_line`, `oracle_text`, `mana_cost`, `colors`,
`power/toughness/loyalty`), print-visual (`artist`, `illustration_id`, `image_uris`),
and localization (`printed_*`). The gameplay fields are **invariant across a card's
prints and languages** (a face's name/oracle_text/power is the same in every edition and
every language). Storing all of it per-print — which mirroring the Card Face object 1:1
would do — duplicates the gameplay data once per print: a card with N reprints stores its
faces' gameplay N times (~45% duplication measured on the initial single-table seed).

So faces are split by nature into two tables:

**`card_definition_faces`** — gameplay per face, one row per (oracle, face). PK
`(oracle_id, face_index)`, FK `oracle_id → card_definitions`.

| column                    | type     | note                                               |
| ------------------------- | -------- | -------------------------------------------------- |
| oracle_id                 | uuid     | FK → card_definitions(oracle_id) ON DELETE CASCADE |
| face_index                | smallint | 0 = front, 1 = back                                |
| name                      | text     | face oracle name                                   |
| type_line                 | text     |                                                    |
| oracle_text               | text     |                                                    |
| mana_cost                 | text     |                                                    |
| colors                    | text[]   |                                                    |
| power, toughness, loyalty | text     |                                                    |
|                           |          | PRIMARY KEY (oracle_id, face_index)                |

**`card_print_faces`** — print-visual + localized per face, one row per (print, face). PK
`(print_id, face_index)`, FK `print_id → card_prints`. These fields legitimately vary by
print/language (`image_uris`, `printed_*`).

| column            | type     | note                                               |
| ----------------- | -------- | -------------------------------------------------- |
| print_id          | uuid     | FK → card_prints(id) ON DELETE CASCADE             |
| face_index        | smallint | 0 = front, 1 = back                                |
| artist            | text     |                                                    |
| illustration_id   | uuid     |                                                    |
| image_uris        | jsonb    | {small,normal,large} if the face has its own image |
| printed_name      | text     | localized                                          |
| printed_type_line | text     | localized                                          |
| printed_text      | text     | localized                                          |
|                   |          | PRIMARY KEY (print_id, face_index)                 |

**Reading a print's full face:** join `card_print_faces pf` → `card_prints p` (for its
`oracle_id`) → `card_definition_faces df ON df.oracle_id = p.oracle_id AND df.face_index =
pf.face_index`. The gameplay comes from `df`, the visual/localized from `pf`.

Both are only populated for multi-face layouts. Discriminating "how many physical images"
vs "how many textual sub-faces" (split/adventure/flip = 2 sub-faces, 1 image) is handled
in the seed: `card_print_faces.image_uris` is null for a shared-image split's faces (the
image is on the print root), non-null per face for a flippable DFC. `defense` is kept only
on `card_definitions` (root), not on the faces, matching the initial model.

### `card_parts` — all_parts relations (oracle → oracle)

The relation is modeled at the **definition (oracle) level, not the print level**: "Krenko
creates a Goblin" is a gameplay fact true of every printing of Krenko, so both endpoints
are `oracle_id`. A token is itself a full card (its own `oracle_id` + print rows in
`card_definitions`/`card_prints`); `card_parts` only stores the **edge** between two
definitions.

PK `(oracle_id, related_oracle_id, component)`. FK `oracle_id → card_definitions`.

| column            | type | note                                                                               |
| ----------------- | ---- | ---------------------------------------------------------------------------------- |
| oracle_id         | uuid | FK → card_definitions(oracle_id); the definition that declares the relation        |
| related_oracle_id | uuid | the related definition (token / meld part / combo piece). NO strict FK — see below |
| component         | text | token\|meld_part\|meld_result\|combo_piece                                         |
| name              | text | denormalized part name (as listed in all_parts)                                    |
| type_line         | text | denormalized part type_line                                                        |
|                   |      | PRIMARY KEY (oracle_id, related_oracle_id, component)                              |

**Nature of `all_parts` (verified 2026-07-23).** `all_parts` is a **bidirectional list of
co-related cards**, not a directed "X creates Y" graph. The Goblin token's own `all_parts`
lists ~65 entries: one `token` (itself) and ~64 `combo_piece` entries — every card that
produces Goblins (Krenko, Legion Warboss, Dragon Fodder, …). `component` labels the _role_
of the cited part (`token` = it is a token, `combo_piece` = a normal card of the group,
`meld_part`/`meld_result` = meld pieces). Recursion (a token that creates another token) is
covered for free: each definition contributes its own edges, and the full graph emerges
from the union — no chaining logic needed at seed time.

**`related_oracle_id` has NO strict FK.** The graph may cite an oracle whose prints never
pass the paper/en/fr filter (a digital-only meld_result, an un-seeded token). A strict FK
would break the seed on those; readers LEFT JOIN `card_definitions`/`card_prints` and show
what exists.

**Resolution (print id → oracle id).** An `all_parts` entry exposes the part's **print
`id`, not its `oracle_id`** (fields: `id`, `component`, `name`, `type_line`, `uri`,
`object`). The seed therefore resolves parts in a **second pass**: pass 1 builds
`card_prints` (a complete `print_id → oracle_id` mapping now lives in the DB); pass 2
re-reads each card's `all_parts`, resolves each `related_print_id` to its
`related_oracle_id` via that mapping, and upserts `card_parts`. Edges whose cited print is
absent from `card_prints` are skipped. Self-edges (a card citing itself) are kept as-is.
Upsert on the composite PK dedupes edges contributed by multiple prints of the same oracle.

### `localized_cards` — removed / migrated

Its role (localized image + printed_* by (set, collector_number, lang≠en)) is now a
`card_prints` row with `lang='fr'` plus its `card_print_faces`/`card_definition_faces`. The table and its readers
(`src/lib/supabase/queries/localized-cards.ts`, `src/lib/scryfall/db/localized-cards.ts`,
the prefetch path) are retired or repointed in the implementation plan. The image-loss
bug on split/adventure/flip (printed_* pulled from the null top-level) is fixed here by
reading printed_* per face during the seed.

## Validation against the official Scryfall docs

The table-to-field mapping was checked against Scryfall's official Card object field
classification (Core / Gameplay / Print) on 2026-07-23:

- **`card_definitions` ↔ Gameplay fields** — confirmed aligned: `cmc`, `colors`,
  `color_identity`, `keywords`, `legalities`, `mana_cost`, `oracle_text`,
  `power/toughness/loyalty/defense`, `reserved`, `edhrec_rank` are all documented
  Gameplay fields.
- **`card_prints` ↔ Print fields** — confirmed aligned: `set`, `collector_number`,
  `rarity`, `artist`, `border_color`, `frame`, `image_status`, `image_uris`,
  `finishes`, `released_at`, `promo/reprint/variation/digital`, `printed_*` are all
  documented Print fields.
- **`layout` is a Core field** (per-Card-object), not Gameplay — but it is invariant
  across a definition's prints (every print of Delver is `transform`), so keeping it on
  `card_definitions` is functionally correct. `lang`, `oracle_id`, `id` are also Core
  fields, consistent with each EN/FR Card object being a distinct print row.
- **`card_parts` ↔ Related Card Object** — the Related Card object exposes `id` (a print
  id), `component`, `name`, `type_line` (+ `uri`, unused). We store the edge at oracle
  level (`oracle_id → related_oracle_id`), resolving the cited print id to its oracle in a
  second seed pass — see the `card_parts` table and Seed sections.
- **`'reversible_card'`** must be added to the `ScryfallLayout` TS type (present in the
  API, absent from our type).

## Seed

Model the seed on the existing streaming seeder
`scripts/seed/seed-localized-cards.ts` (streams the bulk line-by-line, never buffers
the whole file, writes via the service-role key which bypasses RLS).

- **Bulk**: `all_cards` (every card in every language, ~2.5 GB), fetched
  via the `/bulk-data` metadata endpoint then streamed from `*.scryfall.io` (no rate
  limit on the bulk host).
- **Filter**: keep rows where `lang in ('en','fr')` AND `games` contains `'paper'`
  (exclude digital-only Arena/MTGO cards). **Tokens are full cards** (`object:card`,
  `layout: token`/`double_faced_token`, own `oracle_id` + print, `games:[paper]`) and are
  seeded like any other card — they are NOT sub-objects. Verified: Krenko's Goblin token
  is set `tfdn`, paper, with its own `oracle_id`.

The seed runs in **two passes** (the second is required because `all_parts` cites print
ids, not oracle ids):

- **Pass 1 — cards, prints, faces.** For each kept bulk row:
  - upsert `card_definitions` on `oracle_id` (idempotent — many prints share one oracle),
  - upsert `card_definition_faces` on `(oracle_id, face_index)` (idempotent per oracle,
    deduped per batch like `card_definitions` — many prints emit identical face gameplay),
  - upsert `card_prints` on `id` (arbiter `(set, collector_number, lang)` also unique),
  - replace `card_print_faces` for that print (delete-then-insert on `(print_id,
face_index)`, chunked delete like the other per-print replacements).
    After pass 1 the DB holds a complete `print_id → oracle_id` mapping.
- **Pass 2 — parts.** Re-stream the bulk (or a retained id list), and for each card's
  `all_parts`: resolve each `related_print_id → related_oracle_id` via the pass-1 mapping,
  then upsert `card_parts(oracle_id, related_oracle_id, component, name, type_line)` on its
  composite PK (dedupes edges from multiple prints of the same oracle). Skip edges whose
  cited print is absent from `card_prints`.
- **Image sizes**: store only `{small, normal, large}` in every `image_uris` jsonb
  (the app never reads png/art_crop/border_crop on the card path).
- Batched upserts (like the localized seeder's `UPSERT_BATCH = 500`). Keep the streaming
  discipline that avoided prior OOMs — do not buffer the whole file or a ~90k in-memory
  map; the print→oracle mapping lives in the DB (pass 2 queries it), not in RAM.

## Scope

**In scope**

- Rename `cards → card_entries` (migration + call sites + RLS/FK/constraints),
  as the first isolated, verified step.
- Create `card_definitions`, `card_definition_faces`, `card_prints`, `card_print_faces`, `card_parts`.
- Retire/migrate `localized_cards`.
- Seed script from `all_cards` (EN + FR, paper). `default_cards` is English-only for cards that have an English print, so it cannot supply FR prints — `all_cards` is required.
- RLS: public read (these are public card data, like `localized_cards`), service_role
  write only (no write policies; seed uses service-role key + table grants).

**Out of scope (later sub-projects)**

- Reading from the DB in the app (card page, search, prints) — sub-project 1.
- `card_entries.scryfall_id → card_prints(id)` FK — deferred to sub-project 1 (requires
  full print coverage to avoid FK violations).
- Freshness / incremental re-seed — sub-project 2.
- Pre-generated SSR / page cache — sub-project 3.
- **Prices** — excluded entirely (volatile daily data; belongs in a separate
  `card_prices` table/flow if ever needed, not in the catalog).
- `flavor_name`, `flavor_text` — not stored. Both are Print fields (and `flavor_text`
  is localizable), but no current consumer displays them (YAGNI). Add to `card_prints` /
  `card_print_faces` alongside `printed_*` if a future view needs printed flavor text.

## Verification

No test framework in this project (per project conventions) — verify via `npm run check`

- runtime (dev, `sb:migrate`/`sb:reset`, Studio):

* After the rename step: `npm run check` green on no-NEW-problems basis, app runtime
  still loads decks/collection (the renamed table's readers).
* After table creation: `sb:reset` applies cleanly; tables present in Studio.
* After seed: row counts sane (`card_definitions` ~30k, `card_prints` EN+FR), spot-check
  a known card (dsk/1 EN+FR share oracle_id, FR has printed_name), a DFC (2 faces with
  images), a split (2 faces, image on face 0/root only), a token producer (card_parts).
* Add `'reversible_card'` to the `ScryfallLayout` type as part of this work.
