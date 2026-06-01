# MPC Card Ingestion

The ingestion script (`scripts/ingest-mpc-cards.ts`) populates the `custom_card_sources` and `custom_cards` tables by scraping [mpcfill.com](https://mpcfill.com) and downloading images from Google Drive into Supabase Storage.

It is a one-shot script — not a background job. Run it manually whenever you want to refresh the community card catalog.

## Prerequisites

- Local Supabase stack running (`npm run sb:start`)
- Migrations applied (`npm run sb:migrate`) — the `custom_card_sources` and `custom_cards` tables must exist
- A Google Drive API key with the Drive API enabled

## Environment Variables

Add to `.env.local` (or export before running):

```bash
SUPABASE_URL=http://127.0.0.1:54321          # or your production URL
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...      # Settings → API → Secret key
GOOGLE_DRIVE_API_KEY=AIza...                 # Google Cloud Console → Credentials
```

The script uses the **service role key** to bypass RLS for bulk inserts.

## Running

Full ingestion (~274 sources):

```bash
npx tsx scripts/ingest-mpc-cards.ts
```

Single source (for testing):

```bash
npx tsx scripts/ingest-mpc-cards.ts --source=mpcfill:TwoSheds
```

Limited run (first N sources):

```bash
npx tsx scripts/ingest-mpc-cards.ts --limit=5
```

Skip Scryfall enrichment (images only):

```bash
npx tsx scripts/ingest-mpc-cards.ts --skip-scryfall
```

## What It Does

1. Fetches all sources from `mpcfill.com/2/sources/`, filters to Google Drive sources
2. Upserts each source into `custom_card_sources`
3. For each source:
   - Lists image files in the Google Drive folder
   - Skips files already in `custom_cards` with `image_storage_path IS NOT NULL` (resumable)
   - Downloads each image and uploads to the `custom-cards` Storage bucket at `{source_id}/{file_id}.{ext}`
   - Upserts a row into `custom_cards`
4. Updates `card_count` and `last_synced_at` on the source row
5. **Scryfall enrichment** (unless `--skip-scryfall`):
   - Loads all cards in the source with `enriched_at IS NULL`
   - Batches normalized card names (75 per request) → POST `/cards/collection` (exact match only)
   - For each matched card: sets `oracle_id` + `enriched_at` on the row
   - Non-matched cards are left with `enriched_at = NULL` and retried on the next run

Concurrency: 5 sources in parallel, 10 images per source in parallel. Scryfall calls are throttled to 100ms minimum spacing (10 req/s max).

## Resumability

The script is safe to re-run. Cards with `image_storage_path` already set are skipped for image download. Cards with `enriched_at IS NOT NULL` are skipped for Scryfall enrichment.

If a run is interrupted, restart it with the same command — it picks up where it left off for both phases.

To force a full re-download of a source (e.g. after Drive content changes), delete the source's rows from `custom_cards` first:

```sql
DELETE FROM custom_cards WHERE source_id = 'mpcfill:TwoSheds';
```

To force a Scryfall re-enrichment only (without re-downloading images):

```sql
UPDATE custom_cards SET oracle_id = NULL, enriched_at = NULL WHERE source_id = 'mpcfill:TwoSheds';
```

Then re-run the script with `--source=mpcfill:TwoSheds`.

## Logs

```
Fetching sources from mpcfill.com…
Processing 274 sources…

[source 1/274] mpcfill:TwoSheds — 312 images found
[source 1/274] mpcfill:TwoSheds — ✓ images done (312 new, 0 skipped, 0 failed)
[source 1/274] mpcfill:TwoSheds — ✓ scryfall (298 matched, 14 unmatched, 0 failed)
[source 2/274] mpcfill:WarpDandy — 1 images found
[source 2/274] mpcfill:WarpDandy — ✓ images done (1 new, 0 skipped, 0 failed)
[source 2/274] mpcfill:WarpDandy — ✓ scryfall (1 matched, 0 unmatched, 0 failed)
...

✅ Ingestion complete.
   Sources processed : 274
   Cards new         : 12847
   Cards skipped     : 1203
   Scryfall matched  : 11902
   Scryfall unmatched: 945
```

Sources with inaccessible Drive folders are skipped with a warning and do not abort the run. Unmatched cards (fan art, tokens with custom names, etc.) are retried on each subsequent run.

## Production

On the self-hosted instance, use the production Supabase URL and service role key:

```bash
SUPABASE_URL=https://your-supabase-host \
SUPABASE_SERVICE_ROLE_KEY=<prod service role key> \
GOOGLE_DRIVE_API_KEY=<key> \
npx tsx scripts/ingest-mpc-cards.ts
```
