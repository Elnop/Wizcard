# Mythic Tools collection import — design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation-plan

## Goal

Add "Mythic Tools" as a collection-import source, alongside the existing
Moxfield / CardNexus / MTGA / Delver Lens adapters. Mythic Tools
(`mythic.tools`, by Studio Laganne) is an MTG companion app whose collection
export is a semicolon-delimited CSV keyed on Scryfall ID.

## Source format

The Mythic Tools export is a **semicolon-delimited** CSV (not comma).

Header:

```
export_type;scryfall_uuid;set_code;quantity;foil_quantity;card_name;set_name;cardMarketId;english_card_name;lang;collector_number
```

Column semantics used by this adapter:

| Column             | Use                                                                             |
| ------------------ | ------------------------------------------------------------------------------- |
| `scryfall_uuid`    | **Primary identifier** — exact Scryfall print (UUID)                            |
| `set_code`         | Fallback identifier (with `collector_number`)                                   |
| `collector_number` | Fallback identifier (with `set_code`)                                           |
| `quantity`         | Non-foil copies → N non-foil `PendingCard`                                      |
| `foil_quantity`    | Foil copies → M foil `PendingCard`                                              |
| `card_name`        | Localized name — carried as `PendingCard.name` (display + last-resort fallback) |
| `lang`             | Scryfall code (`en, de, fr, ja, pt, ru, zhs, zht`, …)                           |

Dropped columns: `export_type`, `set_name`, `cardMarketId`, `english_card_name`.
The Scryfall UUID (with set/number as backup) fully identifies each print, so
these carry no additional resolution value.

### Row expansion

A single row expands by finish. Example — `quantity=3, foil_quantity=1` →
3 non-foil + 1 foil `PendingCard`, all sharing the same `scryfallId`.
Rows with `quantity=0, foil_quantity=0` produce nothing.

### Sourcing note

The exact header string + semicolon delimiter come from a third-party summary of
the app export; the field semantics (Scryfall-ID keying, lang codes, foil/etched,
skip rows without Scryfall ID) come from MythicHub's public import docs. Header
names and delimiter must be confirmed against a real export before this is
considered production-ready — the parser reads columns **by header name**
(via `buildHeaderIndex`), so a header-name mismatch degrades gracefully to
"nothing parsed" rather than mis-parsing, and is a one-line fix.

## Scryfall-ID resolution (shared-pipeline change)

Existing adapters resolve by `name + set + collectorNumber`. Mythic Tools gives
a Scryfall UUID, a more precise identifier. The pipeline **already supports id
identifiers end to end** — `ScryfallCardIdentifier.id` exists, Scryfall's
collection endpoint accepts `{ id }`, and `buildIdentifierKey` already keys
`id.id` as `id:<uuid>`. Only three small additions are needed:

1. **`PendingCard`** (`src/lib/import/types.ts`) gains optional `scryfallId?: string`.
2. **`buildPendingIdentifier`** (`src/lib/import/utils/identifier-dedup.ts`)
   returns `{ id: scryfallId }` when present (highest priority), before the
   existing set/number and name branches.
3. **`useImportPreviewFetch`** (`src/lib/import/hooks/useImportPreviewFetch.ts`):
   - `buildLookup` adds a `byId: Map<string, ScryfallCard>` keyed on
     `sc.id.toLowerCase()`.
   - `resolveCard` tries `byId.get(pc.scryfallId)` first when `pc.scryfallId`
     is set, before the existing set/num → name-set → name chain.

This benefits any future ID-bearing adapter (e.g. Moxfield already emits ids).

## New files (CardNexus template)

- `src/lib/mythic-tools/types.ts` — `MythicToolsRow`.
- `src/lib/mythic-tools/parse.ts` — parses the semicolon CSV into
  `MythicToolsRow[]` + `parseErrors`, via the shared RFC 4180 parser with a
  `;` delimiter (see below). At least one of `scryfall_uuid` /
  (`set_code`+`collector_number`) / `card_name` required per row.
- `src/lib/mythic-tools/mappings.ts` — `lang` (Scryfall code →
  `MtgLanguage`, reusing `SCRYFALL_CODE_TO_LANGUAGE`), finish (foil/etched),
  condition (NM/LP/MP/HP/DMG).
- `src/lib/mythic-tools/import-adapter.ts` — `parseMythicTools(text)` +
  `mythicToolsDescriptor` (`id: 'mythictools'`, label `Mythic Tools CSV`,
  `.csv`, `detect()` keyed on `export_type`/`scryfall_uuid` header + `;`
  delimiter presence).

## Shared util change

`src/lib/csv/rfc4180.ts` `parseCSVRows(text)` is comma-hardcoded. Add an
optional `delimiter: string = ','` parameter (character-level state machine
compares against it instead of literal `,`). Non-breaking for all existing
callers; Mythic Tools passes `';'`.

## Registration

`src/lib/import/formats/registry.ts`:

- add `mythicToolsDescriptor` to `FORMAT_REGISTRY`
- add `mythictools: parseMythicTools` to `PARSERS`
- add `'mythictools'` to `ImportFormatId` union (`src/lib/import/types.ts`)

## Testing / verification

No test framework in this repo (`project_no_test_framework`). Verify via:

- `npm run check` — gate on **no new** problems (baseline is red,
  `project_check_red_baseline`); run `npx eslint` on changed files.
- Runtime: open the collection Import modal, feed a hand-crafted Mythic Tools
  sample CSV, confirm detection, row-expansion (foil split), ID resolution,
  language mapping, and the not-found table for a deliberately bad Scryfall ID.

## Out of scope

- Export **to** Mythic Tools format (import only).
- Sold-card ledger / separate export streams.
- Deck import from Mythic Tools (collection only).
