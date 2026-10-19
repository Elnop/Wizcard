# Catalog seed (GitHub Action)

The `catalog-seed` workflow (`.github/workflows/catalog-seed.yml`) seeds the **PROD** Scryfall catalog: `scripts/seed/seed-sets.ts` (`card_sets`), then `scripts/seed/seed-catalog.ts` (catalog tables from the `all_cards` bulk). It replaces the manual `npm run seed:prod` from the owner's machine.

- Triggers: every Monday at 04:00 UTC (cron) and on demand (`workflow_dispatch`).
- Code: the workflow file is read from `main`, but the seed scripts are checked out from **`deploy`**. A script newer than the prod schema therefore never writes to prod: advance `deploy` (and apply its migrations) first.
- One run at a time (`concurrency: catalog-seed`, a queued run waits, it never cancels the running one). GitHub keeps only one pending run per group: a third trigger cancels the run already waiting, and that cancelled run opens no failure issue. Job timeout: 345 min (runner limit 6 h).
- No artifact is uploaded and the logs are ndjson. The Supabase URL and key are GitHub secrets, so they show as `***` in the logs.

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
