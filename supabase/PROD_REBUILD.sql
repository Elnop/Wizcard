-- ==========================================================
-- PROD REBUILD SCRIPT - a coller dans Supabase Studio > SQL Editor
-- Genere le 2026-06-15 a partir des migrations locales
-- /!\ DESTRUCTIF : drop le schema public + donnees. Donnees prod jetables = OK.
-- ==========================================================

begin;

-- ---- Preambule : nettoyage idempotent ----
drop policy if exists "public read custom-cards bucket" on storage.objects;
drop policy if exists "service role write custom-cards bucket" on storage.objects;
drop policy if exists "user manage own storage objects" on storage.objects;
drop policy if exists "user upload to own folder" on storage.objects;

-- NB: on ne supprime PAS storage.objects (protege par trigger Supabase).
-- Le bucket est recree par la migration avec "on conflict do nothing".

drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
delete from supabase_migrations.schema_migrations;


-- ============== 20260313000000_create_collections.sql ==============
-- Migration: create collections table with RLS
-- Date: 2026-03-13

create table public.collections (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  card_id         text        not null,
  quantity        integer     not null default 1 check (quantity >= 1),
  date_added      timestamptz not null default now(),
  is_foil         boolean,
  foil_type       text        check (foil_type in ('foil', 'etched')),
  condition       text,
  language        text,
  purchase_price  text,
  tradelist_count integer,
  alter           boolean,
  proxy           boolean,
  tags            text[],
  primary key (user_id, card_id)
);

alter table public.collections enable row level security;

create policy "select own" on public.collections for select using (auth.uid() = user_id);
create policy "insert own" on public.collections for insert with check (auth.uid() = user_id);
create policy "update own" on public.collections for update using (auth.uid() = user_id);
create policy "delete own" on public.collections for delete using (auth.uid() = user_id);

-- ============== 20260314000000_recreate_collections.sql ==============
-- Drop old table (1 row = 1 card with quantity column)
drop table if exists public.collections cascade;

-- New table: 1 row = 1 physical copy, PK = row_id
create table public.collections (
  row_id       uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  card_id      text        not null,
  date_added   timestamptz not null default now(),
  is_foil      boolean,
  foil_type    text,
  condition    text,
  language     text,
  purchase_price text,
  tradelist_count integer,
  alter        boolean,
  proxy        boolean,
  tags         text[]
);

create index on public.collections (user_id, card_id);

-- RLS
alter table public.collections enable row level security;

create policy "Users can view their own collection"
  on public.collections for select
  using (auth.uid() = user_id);

create policy "Users can insert into their own collection"
  on public.collections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own collection"
  on public.collections for update
  using (auth.uid() = user_id);

create policy "Users can delete from their own collection"
  on public.collections for delete
  using (auth.uid() = user_id);

-- ============== 20260315000000_add_constraints.sql ==============
-- Add CHECK constraints for foil_type and condition columns
ALTER TABLE public.collections
  ADD CONSTRAINT collections_foil_type_check
    CHECK (foil_type IS NULL OR foil_type IN ('foil', 'etched')),
  ADD CONSTRAINT collections_condition_check
    CHECK (condition IS NULL OR condition IN ('NM', 'LP', 'MP', 'HP', 'DMG'));

-- Covering index for fetchCollection to avoid heap fetches
CREATE INDEX ON public.collections (user_id) INCLUDE (card_id, row_id, date_added);

-- ============== 20260322000000_rename_collections_to_cards.sql ==============
-- Rename table `collections` → `cards` and columns `row_id` → `id`, `card_id` → `scryfall_id`
ALTER TABLE public.collections RENAME TO cards;
ALTER TABLE public.cards RENAME COLUMN row_id TO id;
ALTER TABLE public.cards RENAME COLUMN card_id TO scryfall_id;

-- Recréer les RLS policies avec le bon nom
DROP POLICY "Users can view their own collection" ON public.cards;
DROP POLICY "Users can insert into their own collection" ON public.cards;
DROP POLICY "Users can update their own collection" ON public.cards;
DROP POLICY "Users can delete from their own collection" ON public.cards;

CREATE POLICY "Users can view their own cards" ON public.cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own cards" ON public.cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cards" ON public.cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cards" ON public.cards FOR DELETE USING (auth.uid() = user_id);

-- Renommer les constraints
ALTER TABLE public.cards RENAME CONSTRAINT collections_foil_type_check TO cards_foil_type_check;
ALTER TABLE public.cards RENAME CONSTRAINT collections_condition_check TO cards_condition_check;

-- ============== 20260322000001_tradelist_count_to_for_trade.sql ==============
-- Replace tradelist_count (integer) with for_trade (boolean) per-copy
ALTER TABLE public.cards ADD COLUMN for_trade boolean DEFAULT false;
UPDATE public.cards SET for_trade = (tradelist_count > 0) WHERE tradelist_count IS NOT NULL;
ALTER TABLE public.cards DROP COLUMN tradelist_count;

-- ============== 20260322000002_rename_user_id_to_owner_id.sql ==============
-- Rename user_id to owner_id for semantic clarity
ALTER TABLE public.cards RENAME COLUMN user_id TO owner_id;

-- ============== 20260407000000_create_decks.sql ==============
-- Create decks table
create table public.decks (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  format      text        check (format is null or format in (
    'standard', 'modern', 'pioneer', 'legacy', 'vintage',
    'commander', 'pauper', 'draft', 'limited', 'oathbreaker', 'brawl'
  )),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.decks (owner_id);

alter table public.decks enable row level security;

create policy "Users can view their own decks"
  on public.decks for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own decks"
  on public.decks for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own decks"
  on public.decks for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own decks"
  on public.decks for delete
  using (auth.uid() = owner_id);

-- Add deck_id and zone columns to cards table
alter table public.cards add column deck_id uuid references public.decks(id) on delete cascade;
alter table public.cards add column zone text check (zone is null or zone in ('mainboard', 'sideboard', 'maybeboard', 'commander'));

-- Make owner_id nullable (deck-only cards have no owner_id)
alter table public.cards alter column owner_id drop not null;

-- At least one of owner_id or deck_id must be set
alter table public.cards add constraint cards_owner_or_deck
  check (owner_id is not null or deck_id is not null);

-- Index for deck card queries
create index on public.cards (deck_id) where deck_id is not null;

-- Update RLS policies to support deck-only cards (owner_id null, deck_id set)
drop policy "Users can view their own cards" on public.cards;
create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can insert their own cards" on public.cards;
create policy "Users can insert their own cards"
  on public.cards for insert
  with check (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can update their own cards" on public.cards;
create policy "Users can update their own cards"
  on public.cards for update
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can delete their own cards" on public.cards;
create policy "Users can delete their own cards"
  on public.cards for delete
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

-- ============== 20260407000001_drop_zone_column.sql ==============
-- Remove the zone column from cards — zone is now managed via tags (e.g. 'deck:mainboard')
alter table public.cards drop column zone;

-- ============== 20260411000000_create_deck_folders.sql ==============
-- Create deck_folders table (hierarchical, self-referential via parent_id)
create table public.deck_folders (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  parent_id  uuid        references public.deck_folders(id) on delete cascade,
  name       text        not null,
  position   integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.deck_folders (owner_id);
create index on public.deck_folders (parent_id);

alter table public.deck_folders enable row level security;

create policy "Users can view their own folders"
  on public.deck_folders for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own folders"
  on public.deck_folders for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own folders"
  on public.deck_folders for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own folders"
  on public.deck_folders for delete
  using (auth.uid() = owner_id);

-- Add folder_id to decks
-- ON DELETE SET NULL: deleting a folder moves its decks to "Sans dossier" (folderId = null)
alter table public.decks
  add column folder_id uuid references public.deck_folders(id) on delete set null;

create index on public.decks (folder_id) where folder_id is not null;

-- ============== 20260527000000_add_wishlist_column.sql ==============
ALTER TABLE cards
  ADD COLUMN wishlist boolean NOT NULL DEFAULT false;

-- ============== 20260601000000_add_custom_card_sources.sql ==============
create table public.custom_card_sources (
  id              text        primary key,
  name            text        not null,
  description     text,
  provider        text        not null default 'mpcfill',
  external_link   text,
  drive_folder_id text,
  tags            text[]      not null default '{}',
  card_count      int         not null default 0,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.custom_card_sources enable row level security;

create policy "public read custom_card_sources"
  on public.custom_card_sources for select
  using (true);

create policy "service role write custom_card_sources"
  on public.custom_card_sources for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============== 20260601000001_add_custom_cards.sql ==============
create table public.custom_cards (
  id                   text        primary key,
  source_id            text        not null references public.custom_card_sources(id) on delete cascade,
  name                 text        not null,
  raw_name             text        not null,
  image_storage_path   text,
  image_drive_url      text        not null,
  artist               text,
  tags                 text[]      not null default '{}',
  is_public            bool        not null default true,
  created_by           uuid        references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index custom_cards_source_id_idx on public.custom_cards(source_id);
create index custom_cards_name_idx on public.custom_cards(name);

alter table public.custom_cards enable row level security;

create policy "public read custom_cards"
  on public.custom_cards for select
  using (is_public = true);

create policy "service role write custom_cards"
  on public.custom_cards for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============== 20260601000002_create_custom_cards_bucket.sql ==============
insert into storage.buckets (id, name, public)
values ('custom-cards', 'custom-cards', true)
on conflict (id) do nothing;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (bucket_id = 'custom-cards');

create policy "service role write custom-cards bucket"
  on storage.objects for all
  using (bucket_id = 'custom-cards' and auth.role() = 'service_role')
  with check (bucket_id = 'custom-cards' and auth.role() = 'service_role');

-- ============== 20260601000003_add_scryfall_enrichment.sql ==============
alter table public.custom_cards
  add column oracle_id   text,
  add column enriched_at timestamptz;

-- oracle_id matches Scryfall's own field naming convention
create index custom_cards_oracle_id_idx
  on public.custom_cards(oracle_id)
  where oracle_id is not null;

-- ============== 20260604000000_add_parsed_filename_fields.sql ==============
ALTER TABLE custom_cards
  ADD COLUMN IF NOT EXISTS set_code         text,
  ADD COLUMN IF NOT EXISTS collector_number text,
  ADD COLUMN IF NOT EXISTS variants         text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS custom_cards_set_code_idx
  ON custom_cards (set_code)
  WHERE set_code IS NOT NULL;

-- ============== 20260604000001_fix_drive_thumbnail_urls.sql ==============
update public.custom_cards
set image_drive_url = regexp_replace(
  image_drive_url,
  'https://drive\.usercontent\.google\.com/download\?id=([^&]+)&export=view',
  'https://drive.google.com/thumbnail?id=\1&sz=w600-h840'
)
where image_drive_url like 'https://drive.usercontent.google.com/download%';

-- ============== 20260604000002_add_user_card_support.sql ==============
-- source_type distinguishes ingested MPC cards from user-created cards
alter table public.custom_cards
  add column if not exists source_type text not null default 'mpc_ingested'
    check (source_type in ('mpc_ingested', 'user_created'));

-- user_created cards have no external source
alter table public.custom_cards
  alter column source_id drop not null;

-- user_created cards store image in Supabase Storage, not Drive
alter table public.custom_cards
  alter column image_drive_url drop not null;

-- drop the cascade FK so source_id can be null for user_created cards
alter table public.custom_cards
  drop constraint if exists custom_cards_source_id_fkey;

alter table public.custom_cards
  add constraint custom_cards_source_id_fkey
    foreign key (source_id) references public.custom_card_sources(id) on delete set null;

-- extend public read to also allow users to read their own private cards
drop policy if exists "public read custom_cards" on public.custom_cards;

create policy "read custom_cards"
  on public.custom_cards for select
  using (is_public = true or created_by = auth.uid());

-- users can insert their own cards
create policy "user insert own custom_cards"
  on public.custom_cards for insert
  with check (created_by = auth.uid() and source_type = 'user_created');

-- users can update their own cards (rename, toggle public, etc.)
create policy "user update own custom_cards"
  on public.custom_cards for update
  using (created_by = auth.uid() and source_type = 'user_created');

-- users can delete their own cards
create policy "user delete own custom_cards"
  on public.custom_cards for delete
  using (created_by = auth.uid() and source_type = 'user_created');

-- Storage: users can upload images to their own folder (custom-cards/{user_uuid}/...)
create policy "user upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-cards'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage: users can update/delete their own files
create policy "user manage own storage objects"
  on storage.objects for all
  using (
    bucket_id = 'custom-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage: public read for files linked to public cards (replaces the simple policy from bucket creation)
drop policy if exists "public read custom-cards bucket" on storage.objects;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (
    bucket_id = 'custom-cards'
    and (
      exists (
        select 1 from public.custom_cards
        where image_storage_path = name and is_public = true
      )
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- ============== 20260604000003_add_card_type_and_language.sql ==============
alter table public.custom_cards
  add column if not exists card_type text not null default 'card'
    check (card_type in ('card', 'token', 'cardback'));

alter table public.custom_cards
  add column if not exists language text;

create index if not exists custom_cards_card_type_idx
  on public.custom_cards (card_type)
  where card_type != 'card';

create index if not exists custom_cards_language_idx
  on public.custom_cards (language)
  where language is not null;

-- ============== 20260605000001_add_scryfall_fields_to_custom_cards.sql ==============
alter table public.custom_cards
  add column if not exists colors         text[] not null default '{}',
  add column if not exists color_identity text[] not null default '{}',
  add column if not exists cmc            numeric,
  add column if not exists type_line      text,
  add column if not exists mana_cost      text,
  add column if not exists oracle_text    text,
  add column if not exists rarity         text,
  add column if not exists set_name       text,
  add column if not exists artist         text;

create index if not exists custom_cards_colors_idx
  on public.custom_cards using gin (colors)
  where array_length(colors, 1) > 0;

create index if not exists custom_cards_cmc_idx
  on public.custom_cards (cmc)
  where cmc is not null;

-- ============== 20260605000002_add_display_name.sql ==============
-- supabase/migrations/20260605000002_add_display_name.sql
ALTER TABLE public.custom_cards
  ADD COLUMN IF NOT EXISTS display_name text;

-- ============== 20260606000000_add_image_hash.sql ==============
alter table public.custom_cards
  add column if not exists image_hash text;

create index if not exists custom_cards_image_hash_source_idx
  on public.custom_cards (source_id, image_hash)
  where image_hash is not null;

-- ============== 20260606000001_add_custom_cards_search_indexes.sql ==============
create extension if not exists pg_trgm;

create index if not exists custom_cards_name_trgm_idx
  on public.custom_cards using gin (name gin_trgm_ops);

create index if not exists custom_cards_type_line_trgm_idx
  on public.custom_cards using gin (type_line gin_trgm_ops)
  where type_line is not null;

create index if not exists custom_cards_tags_gin_idx
  on public.custom_cards using gin (tags);

create index if not exists custom_cards_rarity_idx
  on public.custom_cards (rarity)
  where rarity is not null;

-- ============== 20260606000002_add_oracle_text_search_index.sql ==============
create index if not exists custom_cards_oracle_text_trgm_idx
  on public.custom_cards using gin (oracle_text gin_trgm_ops)
  where oracle_text is not null;

-- ============== 20260606000003_add_drive_folder_path.sql ==============
alter table public.custom_cards
  add column if not exists drive_folder_path text;

-- ============== 20260612000000_drop_custom_cards_variants.sql ==============
ALTER TABLE custom_cards DROP COLUMN IF EXISTS variants;

-- ============== 20260616000000_public_read_sharing.sql ==============
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (true);

create policy "Public can view all deck folders"
  on public.deck_folders for select
  to anon, authenticated
  using (true);

create policy "Public can view deck cards"
  on public.cards for select
  to anon, authenticated
  using (deck_id is not null);

create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (owner_id is not null);

create view public.public_collection_cards
  with (security_invoker = true) as
  select
    id,
    owner_id,
    scryfall_id,
    date_added,
    is_foil,
    foil_type,
    condition,
    language,
    for_trade,
    alter,
    proxy,
    tags,
    deck_id,
    wishlist
  from public.cards
  where owner_id is not null;

grant select on public.public_collection_cards to anon, authenticated;


-- ---- Enregistrement de l'historique des migrations ----
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260313000000', 'create_collections'),
  ('20260314000000', 'recreate_collections'),
  ('20260315000000', 'add_constraints'),
  ('20260322000000', 'rename_collections_to_cards'),
  ('20260322000001', 'tradelist_count_to_for_trade'),
  ('20260322000002', 'rename_user_id_to_owner_id'),
  ('20260407000000', 'create_decks'),
  ('20260407000001', 'drop_zone_column'),
  ('20260411000000', 'create_deck_folders'),
  ('20260527000000', 'add_wishlist_column'),
  ('20260601000000', 'add_custom_card_sources'),
  ('20260601000001', 'add_custom_cards'),
  ('20260601000002', 'create_custom_cards_bucket'),
  ('20260601000003', 'add_scryfall_enrichment'),
  ('20260604000000', 'add_parsed_filename_fields'),
  ('20260604000001', 'fix_drive_thumbnail_urls'),
  ('20260604000002', 'add_user_card_support'),
  ('20260604000003', 'add_card_type_and_language'),
  ('20260605000001', 'add_scryfall_fields_to_custom_cards'),
  ('20260605000002', 'add_display_name'),
  ('20260606000000', 'add_image_hash'),
  ('20260606000001', 'add_custom_cards_search_indexes'),
  ('20260606000002', 'add_oracle_text_search_index'),
  ('20260606000003', 'add_drive_folder_path'),
  ('20260612000000', 'drop_custom_cards_variants'),
  ('20260616000000', 'public_read_sharing')
on conflict (version) do nothing;


commit;
