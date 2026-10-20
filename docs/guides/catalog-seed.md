# Catalog seed (GitHub Action)

The `catalog-seed` workflow (`.github/workflows/catalog-seed.yml`) seeds the **PROD** Scryfall catalog: `scripts/seed/seed-sets.ts` (`card_sets`), then `scripts/seed/seed-catalog.ts` (catalog tables from the `all_cards` bulk). It replaces the manual `npm run seed:prod` from the owner's machine.

- Triggers: every Monday at 04:00 UTC (cron) and on demand (`workflow_dispatch`).
- Code: the workflow file is read from `main`, but the seed scripts are checked out from **`deploy`**. A script newer than the prod schema therefore never writes to prod: advance `deploy` (and apply its migrations) first.
- One run at a time (`concurrency: catalog-seed`, a queued run waits, it never cancels the running one). GitHub keeps only one pending run per group: a third trigger cancels the run already waiting, and that cancelled run opens no failure issue. Job timeout: 345 min (runner limit 6 h).
- No artifact is uploaded and the logs are ndjson. The Supabase URL and key are GitHub secrets, so they show as `***` in the logs.

## Change journal (`catalog_changes`)

Triggers on `card_prints`, `card_definitions`, `card_print_faces` and `card_definition_faces` (migration `20261020120000_create_catalog_changes.sql`) write every real difference the seed makes to `public.catalog_changes`: one `added` row per new print or definition, one `removed` row per deleted print (with the whole deleted row in `old_value`) or per face dropped from a print that still exists, and one `updated` row per changed field, with the old and new values as `jsonb`. An identical upsert writes nothing, so a full seed over an up-to-date catalog adds zero rows. All columns are tracked, new ones included, except `updated_at` and `card_definitions.edhrec_rank` (a popularity rank that moves every week). `card_parts` and `card_sets` are not journaled. The journal has no foreign key to the catalog, so it outlives deleted prints. Only `service_role` can read it; `anon` and `authenticated` have no access at all. The first seed of an empty catalog logs one `added` row per print and definition (~200k rows). The seed writes each definition once per run, from the oracle's first print in the bulk (sorted by print id): Scryfall's `oldschool` legality is per print, and writing every print's copy made the definition flip within a run, each flip logged as a fake legality change.

Prod rollout hazards:

1. Apply the migration and advance `deploy` together, before the next Monday 04:00 UTC run. The old seed code (delete-then-insert print faces, one definition write per print) would flood the journal.
2. The first prod seed with this code switches ~473 oracles from last-print to first-print `oldschool` legality and logs ~3,500 spurious `legalities` rows. Delete them before the first digest (story 3.3); tracked in issue #66.

## One-time setup (before merging the workflow)

The workflow fails on its first step if these are missing.

1. GitHub → repository **Settings → Environments → New environment** → name it `prod`.
2. **Deployment branches and tags** → _Selected branches and tags_ → add `main` and `deploy`.
3. **Environment secrets** (not repository secrets):
   - `SUPABASE_URL` — the prod Kong URL (`SERVICE_URL_SUPABASEKONG` in `.env.supabase.prod`).
   - `SUPABASE_SERVICE_ROLE_KEY` — the prod service-role key (`SERVICE_SUPABASESERVICE_KEY` in `.env.supabase.prod`).

Do not set `SEED_TARGET`: in CI the scripts read the two variables straight from the environment.

## Running it manually

GitHub → **Actions → catalog-seed → Run workflow** (branch `main`). Or:

```bash
gh workflow run catalog-seed.yml --ref main
```

## Reading the job summary

Each seed step adds one line to the run's summary page, measured with `/usr/bin/time -v`:

```
- **seed-sets** : succès, durée 0:41.20, pic mémoire 210.4 Mo
- **seed-catalog** : succès, durée 1:12:05, pic mémoire 1830.7 Mo
```

The duration is the wall-clock time, the memory figure is the peak resident set size (runner limit: 7 GB). A step that did not run shows `non exécutée` (for example the catalog step after a failed sets step). `succès` is shown only when `time` recorded `Exit status: 0`; a step killed by a timeout or a cancellation leaves an empty or truncated file and shows `interrompue ou inconnue`. The first line of the summary gives the `deploy` commit that was run.

## Handling a failure issue

When the `seed` job does not succeed (failure, timeout or manual cancellation), the `alert` job opens an issue labelled `bug` + `catalog-seed` with a link to the run. If such an issue is already open, it adds a comment with the new run link instead, so there is only one open failure issue at a time.

1. Open the run linked in the issue and find the failing step (missing secrets, `seed-sets`, `seed-catalog`, or a timeout).
2. Fix the cause (secrets, Scryfall outage, a script fix released to `deploy`, ...).
3. Re-run the workflow manually. The seed is an idempotent upsert, so re-running after a partial run is safe.
4. Close the issue once a run succeeds. The next failure opens a new one.
