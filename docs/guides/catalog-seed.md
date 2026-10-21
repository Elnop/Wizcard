# Catalog seed (GitHub Action)

The `catalog-seed` workflow (`.github/workflows/catalog-seed.yml`) seeds the **PROD** Scryfall catalog: `scripts/seed/seed-sets.ts` (`card_sets`), then `scripts/seed/seed-catalog.ts` (catalog tables from the `all_cards` bulk), then `scripts/seed/seed-migrations.ts` (`scryfall_migrations`, see below), then `scripts/seed/catalog-digest.ts` (the "Catalogue" article, see below). It replaces the manual `npm run seed:prod` from the owner's machine.

- Triggers: every Monday at 04:00 UTC (cron) and on demand (`workflow_dispatch`).
- Code: the workflow file is read from `main`, but the seed scripts are checked out from **`deploy`**. A script newer than the prod schema therefore never writes to prod: advance `deploy` (and apply its migrations) first.
- One run at a time (`concurrency: catalog-seed`, a queued run waits, it never cancels the running one). GitHub keeps only one pending run per group: a third trigger cancels the run already waiting, and that cancelled run opens no failure issue. Job timeout: 345 min (runner limit 6 h).
- No artifact is uploaded and the logs are ndjson. The Supabase URL and key are GitHub secrets, so they show as `***` in the logs.

## Change journal (`catalog_changes`)

Triggers on `card_prints`, `card_definitions`, `card_print_faces` and `card_definition_faces` (migration `20261020120000_create_catalog_changes.sql`) write every real difference the seed makes to `public.catalog_changes`: one `added` row per new print or definition, one `removed` row per deleted print (with the whole deleted row in `old_value`) or per face dropped from a print that still exists, and one `updated` row per changed field, with the old and new values as `jsonb`. An identical upsert writes nothing, so a full seed over an up-to-date catalog adds zero rows. All columns are tracked, new ones included, except `updated_at` and `card_definitions.edhrec_rank` (a popularity rank that moves every week). `card_parts` and `card_sets` are not journaled. The journal has no foreign key to the catalog, so it outlives deleted prints. Only `service_role` can read it; `anon` and `authenticated` have no access at all. The first seed of an empty catalog logs one `added` row per print and definition (~200k rows). The seed writes each definition once per run, from the oracle's first print in the bulk (sorted by print id): Scryfall's `oldschool` legality is per print, and writing every print's copy made the definition flip within a run, each flip logged as a fake legality change.

Prod rollout hazards:

1. Apply the migration and advance `deploy` together, before the next Monday 04:00 UTC run. The old seed code (delete-then-insert print faces, one definition write per print) would flood the journal.
2. The first prod seed with this code switches ~473 oracles from last-print to first-print `oldschool` legality and logs ~3,500 spurious `legalities` rows. They are never announced: the digest's first run only sets its initial marker (see Catalogue digest). Tracked in issue #66.

## Scryfall migrations (`scryfall_migrations`)

Scryfall publishes a list of [migrations](https://scryfall.com/docs/api/migrations): a print merged into another one (`merge`, with the new print id) or deleted (`delete`). The `Seed migrations` step (`scripts/seed/seed-migrations.ts`, `npm run seed:migrations` locally) copies the whole list into `public.scryfall_migrations` (migration `20261020130000_create_scryfall_migrations.sql`). The "Catalogue" digest (story 3.3) and the user-card remapping (story 2.4, #53) read it.

- What is stored: one row per Scryfall migration id, with `strategy`, `old_scryfall_id`, `new_scryfall_id` (null for `delete`), `note`, `performed_at` and Scryfall's `metadata` (name, set, number and `oracle_id` of the old print).
- When: after a successful `Seed catalog` step (the step only runs if the previous ones succeeded).
- Upsert by id: a re-run with the same list changes no data. `recorded_at` is set on first insert and never rewritten, so it tells when Wizcard first saw a migration. A migration that disappears from Scryfall's list stays in the table: nothing is ever deleted.
- Only `service_role` can read or write the table (select, insert, update; no delete or truncate). `anon` and `authenticated` have no access.

The step fetches every page and validates every object **before** writing anything. It fails (exit 1, so the `alert` job opens an issue) with nothing written when:

- a page answers non-ok after the retries;
- a page says `has_more` without a `next_page`;
- an object is invalid (unknown `migration_strategy`, a non-UUID id, a `merge` without `new_scryfall_id`, a bad `performed_at`, ...); the log names the faulty id;
- the list has fewer than 2,000 migrations (`MIN_EXPECTED_MIGRATIONS`; 2,806 on 2026-10-20), which means a truncated response.

The upsert itself is sent in batches of 500: a database error halfway leaves the earlier batches written, which is harmless since the next run converges.

Prod rollout order: the workflow is read from `main` but runs the scripts from `deploy`, so as soon as it is merged the `Seed migrations` step fails until `deploy` has `scripts/seed/seed-migrations.ts`. Before the next Monday 04:00 UTC run:

1. Apply `20261020130000_create_scryfall_migrations.sql` in the prod SQL editor and check it with `npm run sb:verify:prod`.
2. Merge the PR into `main`.
3. Merge the release PR so `deploy` gets the script.

If the order slips, the run fails and opens an alert issue on purpose (no silent skip): finish the steps above, then re-run the workflow.

## "Catalogue" digest

The `Digest` step (`scripts/seed/catalog-digest.ts`, `npm run digest:catalog` locally; also the last command of `npm run seed`) runs after `Seed migrations` and publishes one `articles` row (`category = 'catalogue'`, `source = 'catalog-digest'`, slug `catalogue-YYYY-MM-DD` in UTC, `-2`, `-3`… when taken) in French and English. The text comes only from the templates of `messages/catalog-digest/*.json` (script-only, never shipped to the client); no LLM is involved. The pure builder is `scripts/seed/catalog-digest-build.ts` (tested by `npm run test:scripts`).

> **Warning:** `npm run seed` and `npm run seed:prod` end with the digest, so they **publish a public article** on the target database (prod for `seed:prod`). Do not run `npm run digest:catalog` by hand while a seed is running: journal rows committed out of order by the seed's parallel writes can land below the marker the digest sets and would then never be announced. Deleting a misfired article does not rewind the marker (`article_id` becomes null): its changes are never announced again.

- **Window:** everything journaled since the last digest: `catalog_changes.id > max(catalog_digests.last_change_id)` and `scryfall_migrations.recorded_at > max(catalog_digests.last_migration_recorded_at)`, capped at the max id / `recorded_at` seen when the step starts. With no previous digest, the window covers the whole journal.
- **Atomic publish:** `publish_catalog_digest()` (migration `20261022120000_create_catalog_digests.sql`, SECURITY DEFINER, executable by `service_role` only) inserts the article and the new marker in one transaction. It refuses to publish when the marker moved since the script read it, so two runs never publish the same changes twice.
- **Recovery:** a seed that failed after journaling part of its changes leaves them above the marker; the next successful run's digest covers them, once.
- **Nothing new:** an empty window publishes nothing and the job summary says `aucun changement, pas d'article`. A window that only holds changes never announced (`oldschool` legalities, a re-issued id) advances the marker without an article (`… (repère avancé)`). Otherwise the summary says `article publié : <slug>`.
- **First run = baseline:** while `catalog_digests` is empty (first run ever in prod, or a fresh local database), the digest only sets the initial marker to the current max of the journal and of the migrations, and **publishes nothing** (summary `repère initial posé, pas d'article`). The first seed therefore never announces the history (initial catalog load, `oldschool` noise, the ~2,800 historical Scryfall migrations); the next seed announces only what changed since. `npm run digest:catalog -- --baseline` does the same on demand (the marker jumps to now; pending changes are then never announced).
- **Content:** the title names the strongest event (new set > new cards in an existing set, « N nouvelles cartes dans X » > French translations > HD images > the rest); every type then gets its own `##` section. Cards are shown in grids of 12 at most per set ("and N more" with a link to the set), 10 sets at most per section, 50 lines at most per list (errata, legalities, removed prints, Scryfall migrations). More than 20 cards leaving Standard become one line; a format that appears or disappears on many cards is one line per format (« Nouveau format X : N cartes », « Format retiré X »). Changes of the same field across several seeds are netted (legal → banned → legal is not announced). Oracle errata cover the oracle fields only (name, type, text, mana cost, P/T, loyalty, defense, colors, color identity); any other change counts once per card in « autres corrections », and a window holding only those still publishes an article. All formats except `oldschool` are announced until #66 is resolved. A removed print and an added one on the same (set, number, language) are a re-issued id and appear nowhere. No user data is ever read.
- **Visibility:** the article page is live at once; the `/articles` list follows within an hour (ISR, no on-demand revalidation).

The step fails (exit 1, the `alert` job opens an issue) with neither article nor marker written when a read fails (journal, migrations, catalog references) or when the publish call fails (database error, stale marker). Re-run the workflow (or `npm run digest:catalog`) once the cause is fixed: the same window is retried.

Prod rollout order:

1. The migrations of stories 3.1, 3.2 and 3.4 must already be in prod.
2. Apply `20261022120000_create_catalog_digests.sql` in the prod SQL editor and check it with `npm run sb:verify:prod`.
3. Nothing else: the first `Digest` run after the release finds no marker, sets it and publishes nothing; the first article comes with the following seed. No `oldschool` purge or manual baseline is needed for the digest.
4. Merge the PR into `main`, then merge the release PR so `deploy` gets `scripts/seed/catalog-digest.ts` before the next Monday 04:00 UTC run. Until then the `Digest` step fails and opens an alert issue on purpose.

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

Each seed step adds one line to the run's summary page (the `Digest` step first writes its own outcome line, then its timing line), measured with `/usr/bin/time -v`. Illustrative example (made-up figures, not a measured run):

```
- **seed-sets** : succès, durée 0:41.20, pic mémoire 210.4 Mo
- **seed-catalog** : succès, durée 1:12:05, pic mémoire 1830.7 Mo
- **seed-migrations** : succès, durée 0:12.40, pic mémoire 180.2 Mo
- **catalog-digest** : article publié : catalogue-2026-10-26
- **catalog-digest** : succès, durée 0:08.10, pic mémoire 250.3 Mo
```

The duration is the wall-clock time, the memory figure is the peak resident set size (runner limit: 7 GB). A step that did not run shows `non exécutée` (for example the catalog step after a failed sets step). `succès` is shown only when `time` recorded `Exit status: 0`; a step killed by a timeout or a cancellation leaves an empty or truncated file and shows `interrompue ou inconnue`. The first line of the summary gives the `deploy` commit that was run.

## Handling a failure issue

When the `seed` job does not succeed (failure, timeout or manual cancellation), the `alert` job opens an issue labelled `bug` + `catalog-seed` with a link to the run. If such an issue is already open, it adds a comment with the new run link instead, so there is only one open failure issue at a time.

1. Open the run linked in the issue and find the failing step (missing secrets, `seed-sets`, `seed-catalog`, `seed-migrations`, `catalog-digest`, or a timeout).
2. Fix the cause (secrets, Scryfall outage, a script fix released to `deploy`, ...).
3. Re-run the workflow manually. The seed is an idempotent upsert, so re-running after a partial run is safe.
4. Close the issue once a run succeeds. The next failure opens a new one.
