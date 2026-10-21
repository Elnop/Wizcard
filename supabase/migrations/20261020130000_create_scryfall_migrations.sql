-- Scryfall migrations (story 3.2, issue #61).
--
-- Copy of Scryfall's /migrations list: a print merged into another (`merge`) or
-- removed (`delete`). Written by scripts/seed/seed-migrations.ts after a successful
-- catalog seed (upsert by Scryfall id, never deleted). Read by the "Catalogue"
-- digest (story 3.3) and by the user-card remapping (story 2.4, issue #53).
--
-- - `recorded_at` is set on first insert only (the script never sends it), so it
--   gives the digest the "seen since the last article" window.
-- - service_role only (select/insert/update); anon/authenticated have no access.
--
-- Idempotent: safe to re-run (prod is applied by hand in the SQL editor).
--
-- PROD ROLLOUT (see docs/guides/catalog-seed.md § Scryfall migrations): apply this
-- migration, merge, then release to `deploy` before the next Monday 04:00 UTC
-- catalog-seed run — the workflow (read from main) runs scripts from `deploy`, so
-- the `Seed migrations` step fails until `deploy` has seed-migrations.ts.

create table if not exists public.scryfall_migrations (
  id               uuid primary key,
  strategy         text not null
                   constraint scryfall_migrations_strategy_check
                   check (strategy in ('merge', 'delete')),
  old_scryfall_id  uuid not null,
  new_scryfall_id  uuid,
  note             text,
  performed_at     date not null,
  metadata         jsonb,
  recorded_at      timestamptz not null default now(),
  constraint scryfall_migrations_merge_target_check
    check (strategy <> 'merge' or new_scryfall_id is not null)
);

-- Remapping (story 2.4) looks user prints up by their old id.
create index if not exists scryfall_migrations_old_scryfall_id_idx
  on public.scryfall_migrations (old_scryfall_id);

-- Digest window (story 3.3): migrations recorded since the last article.
create index if not exists scryfall_migrations_recorded_at_idx
  on public.scryfall_migrations (recorded_at);

-- RLS on, NO policy: only roles that bypass RLS (service_role) see rows.
alter table public.scryfall_migrations enable row level security;

-- Explicit revokes: the prod default ACL grants anon/authenticated write (incl.
-- TRUNCATE, which bypasses RLS) on every new table.
revoke all on table public.scryfall_migrations from public, anon, authenticated;

-- The seed upserts (insert + update) and the digest/remapping read. Nothing ever
-- deletes a stored migration.
grant select, insert, update on table public.scryfall_migrations to service_role;
revoke delete, truncate on table public.scryfall_migrations from service_role;
