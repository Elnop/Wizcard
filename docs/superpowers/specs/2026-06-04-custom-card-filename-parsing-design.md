# Custom Card Filename Parsing — Design Spec

**Date:** 2026-06-04  
**Status:** Approved

## Context

Custom proxy card sources (mpcfill.com) follow a community naming convention derived from **Proxyshop** where filenames encode Scryfall identifiers:

```
Card Name (Variant/Subtitle) [SET_CODE] {collector_number}.ext
```

Examples:

- `Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg`
- `Elesh Norn, Mother of Machines (v2) [third party art, popout].png`
- `Lightning Bolt [M10] {127}.png`

**The problem:** The current ingestion script (`scripts/ingest-mpc-cards.ts`) ignores `[SET]` and `{collector_number}` entirely, and its `normalizeName()` function only strips a hardcoded list of suffixes. This means:

1. Cards like `Ancient Tomb (Balin's Tomb) [LTC] {357}` fail Scryfall enrichment because the lookup uses the un-normalized string instead of just `Ancient Tomb`.
2. Valuable identifiers (`[LTC] {357}`) that would enable a precise Scryfall lookup by set+collector_number are discarded.
3. Two separate normalization functions exist (ingest script vs. API route) that diverge in behavior.

## Grammar

```
FILENAME   ::= CARD_NAME VARIANT* BRACKET_TAG* COLLECTOR? EXT?
CARD_NAME  ::= text (may include commas, apostrophes, hyphens)
VARIANT    ::= "(" text ")"
BRACKET_TAG::= "[" text "]"
COLLECTOR  ::= "{" digits "}"
EXT        ::= "." ("jpg" | "jpeg" | "png" | "webp" | "gif")
```

**Disambiguation of `[...]`:** A bracket tag may be a Scryfall set code (e.g. `[LTC]`) or a free-form custom tag (e.g. `[third party art, popout]`). These are indistinguishable syntactically. We resolve this at enrichment time: attempt a Scryfall lookup by set+collector_number; if it returns 404, fall back to name lookup.

## Architecture

### 1. Shared filename parser — `src/lib/mpc/parse-filename.ts`

New module, consumed by both the ingest script and the API route.

```typescript
interface ParsedCardFilename {
	cardName: string; // text before first (, [ or {
	variants: string[]; // contents of each (...)
	bracketTags: string[]; // contents of each [...]
	collectorNumber: string | null; // first {digits} or null
	extension: string | null;
}

function parseCardFilename(filename: string): ParsedCardFilename;
```

Parsing rules:

- Strip extension first.
- `cardName` = text up to the first `(`, `[`, or `{`, trimmed.
- `variants` = all `(...)` captures in order.
- `bracketTags` = all `[...]` captures in order.
- `collectorNumber` = first `{N}` where N is all digits, or null.

The first `bracketTag` (if any) is used as `set_code` candidate during enrichment.

### 2. Database migration — `supabase/migrations/20260604000000_add_parsed_filename_fields.sql`

Add three columns to `custom_cards`:

```sql
ALTER TABLE custom_cards
  ADD COLUMN IF NOT EXISTS set_code        text,
  ADD COLUMN IF NOT EXISTS collector_number text,
  ADD COLUMN IF NOT EXISTS variants        text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS custom_cards_set_code_idx
  ON custom_cards (set_code) WHERE set_code IS NOT NULL;
```

These columns are populated at ingestion time using `parseCardFilename`. Existing rows remain with `set_code = NULL` and are retroactively populated on next re-ingestion (the script already skips cards by Drive file ID, so existing cards won't be re-inserted — a separate backfill step is needed for existing data, or a `--backfill` flag can be added to the ingest script).

### 3. Ingest script update — `scripts/ingest-mpc-cards.ts`

Replace `normalizeName()` with `parseCardFilename()`.

At card upsert time, store:

```typescript
{
  name: parsed.cardName,         // was: normalizeName(file.name)
  raw_name: file.name,
  set_code: parsed.bracketTags[0] ?? null,
  collector_number: parsed.collectorNumber,
  variants: parsed.variants,
}
```

### 4. Enrichment improvement — `scripts/ingest-mpc-cards.ts`

Two-strategy enrichment ordered by confidence:

**Strategy A — set + collector_number lookup (new)**  
Used when `set_code IS NOT NULL AND collector_number IS NOT NULL`.  
API call: `GET https://api.scryfall.com/cards/:set_code/:collector_number`  
Returns a single card object with `oracle_id`. Rate limit: same 100ms throttle.  
If response is 404 or any error, fall through to Strategy B (do not mark as failed).

**Strategy B — batch name lookup (existing)**  
Used for all remaining cards.  
Existing `scryfallPost()` batch via `/cards/collection`.

Result: both strategies write `oracle_id` + `enriched_at` on success. Strategy A failures do not set `enriched_at`, allowing re-attempt via Strategy B in the same run.

### 5. API route update — `src/app/api/mpc/index/route.ts`

Replace the inline `normalizeName()` function with `parseCardFilename(filename).cardName`. This unifies behavior with the ingest script.

## Files to Modify

| File                                                                | Change                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/mpc/parse-filename.ts`                                     | **Create** — shared parser                              |
| `supabase/migrations/20260604000000_add_parsed_filename_fields.sql` | **Create** — migration                                  |
| `scripts/ingest-mpc-cards.ts`                                       | Use `parseCardFilename`, add Strategy A enrichment      |
| `src/app/api/mpc/index/route.ts`                                    | Replace inline `normalizeName` with `parseCardFilename` |

## What Is Explicitly Out of Scope

- Filtering by `set_code` in the search UI (no UI changes in this spec)
- Populating `artist` from filenames
- Fuzzy name matching for Scryfall
- Backfilling existing DB rows (separate operation)

## Verification

1. Unit tests for `parseCardFilename` covering:
   - `Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg` → `{ cardName: "Ancient Tomb", variants: ["Balin's Tomb"], bracketTags: ["LTC"], collectorNumber: "357" }`
   - `Elesh Norn, Mother of Machines (v2) [third party art, popout].png` → `{ cardName: "Elesh Norn, Mother of Machines", variants: ["v2"], bracketTags: ["third party art, popout"], collectorNumber: null }`
   - `Lightning Bolt.png` → `{ cardName: "Lightning Bolt", variants: [], bracketTags: [], collectorNumber: null }`

2. `npm run sb:migrate` — verify migration applies cleanly

3. Re-ingest one source: `npx tsx scripts/ingest-mpc-cards.ts --source=mpcfill:<key> --limit=1`  
   Compare `Scryfall matched` count before vs. after — expect significant increase for sources using `[SET] {N}` naming.

4. `npm run check` — TypeScript + lint must pass
