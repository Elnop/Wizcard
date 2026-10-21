-- Articles (story 3.4, issue #63).
--
-- Generic table for every article the site publishes: the weekly "Catalogue"
-- digest (story 3.3, `source = 'catalog-digest'`), and later Magic and site news.
-- Title and Markdown body exist in fr and en. Read by the public pages
-- /[locale]/articles and /[locale]/articles/[slug] through the cookieless anon
-- client (ISR).
--
-- - Public read is limited to PUBLISHED articles (`published_at <= now()`): an
--   article scheduled in the future is invisible to anon/authenticated, even
--   through PostgREST.
-- - Only service_role writes (the digest uses the service key). anon/authenticated
--   get SELECT only; the explicit revokes undo the prod default ACL, which grants
--   them INSERT/UPDATE/DELETE/TRUNCATE (TRUNCATE bypasses RLS) on every new table.
-- - No user data ever goes into an article.
--
-- Idempotent: safe to re-run (prod is applied by hand in the SQL editor).

create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null
                constraint articles_slug_key unique,
  category      text not null
                constraint articles_category_check
                check (category in ('catalogue', 'magic', 'site')),
  title_fr      text not null,
  title_en      text not null,
  body_fr       text not null,
  body_en       text not null,
  published_at  timestamptz not null,
  source        text not null,
  created_at    timestamptz not null default now()
);

-- Slug = URL segment: lowercase ASCII words joined by single hyphens. Titles and
-- bodies are never blank. Added separately (drop + add) so a re-run, or a table
-- created before these rules, converges.
alter table public.articles drop constraint if exists articles_slug_format;
alter table public.articles add constraint articles_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.articles drop constraint if exists articles_text_not_blank;
alter table public.articles add constraint articles_text_not_blank
  check (length(btrim(title_fr)) > 0 and length(btrim(title_en)) > 0
         and length(btrim(body_fr)) > 0 and length(btrim(body_en)) > 0);

-- The list page reads newest first, optionally filtered by category.
create index if not exists articles_category_published_at_idx
  on public.articles (category, published_at desc);

alter table public.articles enable row level security;

drop policy if exists articles_select_published on public.articles;
create policy articles_select_published on public.articles
  for select to anon, authenticated
  using (published_at <= now());

revoke all on table public.articles from public, anon, authenticated;
grant select on table public.articles to anon, authenticated;

grant select, insert, update, delete on table public.articles to service_role;
revoke truncate on table public.articles from service_role;
