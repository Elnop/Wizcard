-- Case-insensitive tag matching for custom_cards.
--
-- Tags are stored with meaningful mixed casing: source-attribution usernames
-- (`mpc-source:mpcfill:RustyShackleford`) and taxonomy labels (`Borderless`,
-- `AI`, `SLD`, `NSFW`). We must NOT lowercase the stored tags — that would
-- corrupt usernames and the display taxonomy.
--
-- Instead, expose a generated, lowercased mirror of the tags array so the app can
-- filter case-insensitively (e.g. the profile Ignored Tags setting hiding `nsfw`
-- must also hide cards tagged `NSFW`). Original `tags` is untouched.

-- Immutable helper: lowercase every element of a text[]. Must be IMMUTABLE to be
-- usable in a STORED generated column.
create or replace function public.lower_tags(t text[])
returns text[]
language sql
immutable
parallel safe
as $$
  select array(select lower(x) from unnest(coalesce(t, '{}'::text[])) x)
$$;

-- Generated, stored mirror of `tags`, always lowercase. Kept in sync by Postgres
-- on every write to `tags` — no application code or ingest change required.
alter table public.custom_cards
  add column if not exists tags_lower text[]
  generated always as (public.lower_tags(tags)) stored;

-- GIN index mirrors the existing custom_cards_tags_gin_idx so case-insensitive
-- array-contains filters (tags_lower @> '{nsfw}') stay fast on 200k+ rows.
create index if not exists custom_cards_tags_lower_gin_idx
  on public.custom_cards using gin (tags_lower);
