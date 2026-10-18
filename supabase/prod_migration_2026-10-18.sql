-- Migrations prod pour le merge main → deploy du 2026-10-18.
-- Écart mesuré par `npm run sb:verify:prod` : 399 passed / 10 failed, tous
-- couverts par les deux migrations ci-dessous (et rien d'autre).
--
--   (1) 20261003120000_card_facets         — RPC de l'index de collection
--   (2) 20261004120000_add_profile_stack_by — préférences d'empilement
--
-- Idempotent + transactionnel. Les CHECK de (2) portent sur des colonnes
-- NOUVELLES au défaut '{}' → aucune ligne existante ne peut les violer.
--
-- À appliquer AVANT d'avancer deploy (le front lit profiles.*_stack_by et
-- appelle /rpc/card_facets). Puis relancer `npm run sb:verify:prod` → 0 FAIL.

begin;

-- ── (1) ──────────────────────────────────────────────────────────────────
create or replace function public.card_facets(p_ids uuid[])
returns table (
  id uuid,
  oracle_id uuid,
  name text,
  lang text,
  layout text,
  "set" text,
  collector_number text,
  rarity text,
  released_at date,
  artist text,
  promo boolean,
  digital boolean,
  cmc numeric,
  colors text[],
  color_identity text[],
  type_line text,
  oracle_text text,
  power text,
  toughness text,
  edhrec_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.oracle_id, d.name, p.lang, d.layout, p.set, p.collector_number,
         p.rarity, p.released_at, p.artist, p.promo, p.digital,
         d.cmc, d.colors, d.color_identity, d.type_line, d.oracle_text,
         d.power, d.toughness, d.edhrec_rank
  from public.card_prints p
  join public.card_definitions d on d.oracle_id = p.oracle_id
  where p.id = any(p_ids);
$$;

grant execute on function public.card_facets(uuid[]) to anon, authenticated;

-- ── (2) ──────────────────────────────────────────────────────────────────
-- Per-list card stacking preference (collection / wishlist / deck owner view).
-- '{}' = stack by card name (historical behaviour); criteria add copy
-- properties that split stacks; '{copy}' alone = no stacking.
alter table public.profiles
  add column if not exists collection_stack_by text[] not null default '{}'::text[],
  add column if not exists wishlist_stack_by   text[] not null default '{}'::text[],
  add column if not exists deck_stack_by       text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_collection_stack_by_check;
alter table public.profiles
  add constraint profiles_collection_stack_by_check check (
    collection_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(collection_stack_by)) or collection_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_wishlist_stack_by_check;
alter table public.profiles
  add constraint profiles_wishlist_stack_by_check check (
    wishlist_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(wishlist_stack_by)) or wishlist_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_deck_stack_by_check;
alter table public.profiles
  add constraint profiles_deck_stack_by_check check (
    deck_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(deck_stack_by)) or deck_stack_by = array['copy']::text[])
  );

-- ── schema_migrations ────────────────────────────────────────────────────
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261003120000', 'card_facets'),
  ('20261004120000', 'add_profile_stack_by')
on conflict do nothing;

commit;
