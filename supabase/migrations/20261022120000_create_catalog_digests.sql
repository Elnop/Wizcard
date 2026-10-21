-- "Catalogue" digest marker (story 3.3, issue #62).
--
-- After each catalog seed, scripts/seed/catalog-digest.ts reads everything journaled
-- since the last digest (catalog_changes.id > max(last_change_id), and
-- scryfall_migrations.recorded_at > max(last_migration_recorded_at)), builds a
-- fr/en "Catalogue" article from translated templates (never an LLM), then calls
-- publish_catalog_digest() which inserts the article AND advances the marker in one
-- transaction. A failed seed that journaled part of its changes is therefore covered
-- exactly once, by the next digest.
--
-- - One catalog_digests row per digest. `article_id` is null when the window held
--   only changes that are never announced (e.g. `oldschool` legalities): the marker
--   still advances, no article is published.
-- - `article_id` is `on delete set null`: deleting an article never rewinds the
--   marker (its changes are not re-announced).
-- - service_role only: it reads the marker (select) and writes only through the
--   SECURITY DEFINER function, which only service_role may execute.
--
-- Idempotent: safe to re-run (prod is applied by hand in the SQL editor).
--
-- PROD ROLLOUT (see docs/guides/catalog-seed.md § "Catalogue" digest): apply this
-- migration (after 20261020120000, 20261020130000 and 20261021120000), check it with
-- `npm run sb:verify:prod`, delete the spurious `oldschool` journal rows (#66) if
-- any, then merge and release to `deploy` before the next Monday 04:00 UTC run.

create table if not exists public.catalog_digests (
  id                          bigint generated always as identity primary key,
  article_id                  uuid
                              constraint catalog_digests_article_id_fkey
                              references public.articles(id) on delete set null,
  last_change_id              bigint not null default 0,
  last_migration_recorded_at  timestamptz,
  created_at                  timestamptz not null default now()
);

-- The window reads max(last_change_id) and max(last_migration_recorded_at).
create index if not exists catalog_digests_last_change_id_idx
  on public.catalog_digests (last_change_id);

-- RLS on, NO policy: only roles that bypass RLS (service_role, the definer) see rows.
alter table public.catalog_digests enable row level security;

-- Explicit revokes: the prod default ACL grants anon/authenticated write (incl.
-- TRUNCATE, which bypasses RLS) on every new table and sequence.
revoke all on table public.catalog_digests from public, anon, authenticated;
revoke all on sequence public.catalog_digests_id_seq from public, anon, authenticated;

-- The digest script reads the marker; it writes only through the function below.
grant select on table public.catalog_digests to service_role;
revoke insert, update, delete, truncate on table public.catalog_digests from service_role;

-- Publishes one digest atomically: the article (when p_title_fr is not null) and the
-- marker. The caller passes the marker it read (p_from_*) and the one to store
-- (p_last_*): if another digest was recorded in between, it raises instead of
-- publishing the same changes twice. The slug gets -2, -3, ... when already taken.
-- Returns the published slug, or null when only the marker advanced.
create or replace function public.publish_catalog_digest(
  p_slug                        text,
  p_title_fr                    text,
  p_title_en                    text,
  p_body_fr                     text,
  p_body_en                     text,
  p_from_change_id              bigint,
  p_from_migration_recorded_at  timestamptz,
  p_last_change_id              bigint,
  p_last_migration_recorded_at  timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur_change    bigint;
  v_cur_migration timestamptz;
  v_slug          text;
  v_n             int := 1;
  v_article       uuid;
begin
  -- One digest at a time: a concurrent call waits here, then sees the new marker.
  lock table public.catalog_digests in exclusive mode;

  select coalesce(max(last_change_id), 0), max(last_migration_recorded_at)
    into v_cur_change, v_cur_migration
    from public.catalog_digests;

  if v_cur_change is distinct from coalesce(p_from_change_id, 0)
     or v_cur_migration is distinct from p_from_migration_recorded_at then
    raise exception 'publish_catalog_digest: stale window (marker moved since it was read)';
  end if;

  if coalesce(p_last_change_id, 0) < v_cur_change
     or (v_cur_migration is not null
         and (p_last_migration_recorded_at is null
              or p_last_migration_recorded_at < v_cur_migration)) then
    raise exception 'publish_catalog_digest: the marker cannot move backwards';
  end if;

  if p_title_fr is not null then
    v_slug := p_slug;
    while exists (select 1 from public.articles a where a.slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := p_slug || '-' || v_n;
    end loop;

    insert into public.articles
      (slug, category, title_fr, title_en, body_fr, body_en, published_at, source)
    values
      (v_slug, 'catalogue', p_title_fr, p_title_en, p_body_fr, p_body_en, now(), 'catalog-digest')
    returning id into v_article;
  end if;

  insert into public.catalog_digests (article_id, last_change_id, last_migration_recorded_at)
  values (v_article, coalesce(p_last_change_id, 0), p_last_migration_recorded_at);

  return v_slug;
end;
$$;

revoke execute on function public.publish_catalog_digest(
  text, text, text, text, text, bigint, timestamptz, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.publish_catalog_digest(
  text, text, text, text, text, bigint, timestamptz, bigint, timestamptz
) to service_role;
