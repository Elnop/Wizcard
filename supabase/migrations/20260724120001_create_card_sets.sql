-- Set metadata, joined by card_prints.set = card_sets.code. Separated (not repeated on
-- every print) like Scryfall separates the Set object. Seeded from /sets (see seed:sets).
create table if not exists public.card_sets (
  code           text primary key,
  id             uuid,
  name           text not null,
  set_type       text,
  released_at    date,
  card_count     int,
  digital        boolean,
  icon_svg_uri   text,
  parent_set_code text,
  block          text,
  block_code     text,
  updated_at     timestamptz not null default now()
);

alter table public.card_sets enable row level security;
drop policy if exists card_sets_select_all on public.card_sets;
create policy card_sets_select_all on public.card_sets for select using (true);
grant select on public.card_sets to anon, authenticated;
grant select, insert, update, delete on public.card_sets to service_role;
