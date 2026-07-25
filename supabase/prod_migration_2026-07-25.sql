-- =============================================================================
-- WIZCARD — Script de migration PROD consolidé (à coller dans l'éditeur SQL prod)
-- Généré 2026-07-25. Applique les 8 migrations manquantes sur origin/deploy :
--   1) 20260722120000_add_localized_cards        (créée puis DROP en 4 — no-op net)
--   2) 20260723120000_rename_cards_to_card_entries
--   3) 20260723120001_create_card_catalog
--   4) 20260723120002_drop_localized_cards
--   5) 20260724120000_add_print_external_ids
--   6) 20260724120001_create_card_sets
--   7) 20260724120002_restore_table_grants
--   8) 20260724120003_restore_decks_write_grants
--
-- Contexte : chantier "catalogue Scryfall en DB". Renomme la table utilisateur
-- `cards` → `card_entries`, puis crée le miroir catalogue (card_definitions,
-- card_prints, *_faces, card_parts, card_sets) rempli ENSUITE par le seed.
--
-- Rendu IDEMPOTENT (rejouable) et TRANSACTIONNEL (tout ou rien).
--
-- ✅ SÛRETÉ DONNÉES — audité contre la prod le 2026-07-25 :
--    - Prod contient 105 544 lignes dans `cards`, 1 961 decks, 11 profils.
--    - Le RENAME préserve les lignes, FK, index et policies (ALTER … RENAME).
--      AUCUN backfill, AUCUN UPDATE/DELETE sur les lignes existantes.
--    - Les 5+1 tables catalogue sont créées VIDES (aucune donnée déplacée) :
--      elles sont peuplées après coup par `npm run seed` (voir .env.seed).
--    - localized_cards est créée en (1) puis supprimée en (4) : sur prod elle
--      n'existe pas aujourd'hui, donc l'effet net est nul. Les étapes sont
--      conservées pour que schema_migrations reflète l'historique réel.
--
-- ⚠️ ORDRE NON NÉGOCIABLE : (2) doit précéder (7) — restore_table_grants
--    accorde sur `card_entries`, qui n'existe qu'après le rename.
--    (3) doit précéder (5) et (6) : add_print_external_ids ALTER card_prints.
--
-- ⚠️ APRÈS ce script, la prod attend encore le SEED du catalogue (tables vides).
--    Ne pas avancer la branche deploy tant que le seed n'a pas tourné, sinon le
--    front lira un catalogue vide.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) 20260722120000_add_localized_cards
-- -----------------------------------------------------------------------------

-- Cache partagé des images/textes localisés (non-anglais), pré-rempli par le seed
-- bulk (scripts/seed/seed-localized-cards.ts). Supprime le N+1 sur api.scryfall.com
-- en 1re visite : le client lit ici par (set, collector_number, lang) au lieu de
-- fetcher /cards/{set}/{number}/{lang} carte par carte.
--
-- PK = (set, collector_number, lang) : la seule clé que le client possède au moment
-- de lire (il ne connaît pas l'UUID du print localisé, c'est ce qu'il vient chercher).
-- scryfall_id (print localisé) et oracle_id (identité gameplay) sont des colonnes de
-- liaison/traçabilité, pas la clé d'accès.
--
-- card_faces : TOUJOURS un tableau de 1 ou 2 entrées (Option 1 — jamais NULL, jamais
-- de colonne racine image_uris/printed_* séparée). Mono-face = 1 entrée ; carte à deux
-- images physiques (transform, modal_dfc) = 2 entrées. Chaque entrée porte
-- { image_uris, printed_name, printed_type_line, printed_text } (noms Scryfall).
--
-- image_status : qualité du scan Scryfall (niveau carte). Jamais missing/placeholder
-- (filtrés au seed) → en pratique 'lowres' ou 'highres_scan'. not null.
create table if not exists public.localized_cards (
  set text not null,
  collector_number text not null,
  lang text not null,
  scryfall_id uuid not null,
  oracle_id uuid,
  image_status text not null,
  card_faces jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (set, collector_number, lang)
);

create unique index if not exists localized_cards_scryfall_id_key
  on public.localized_cards (scryfall_id);

create index if not exists localized_cards_oracle_id_idx
  on public.localized_cards (oracle_id);

-- lang est toujours non-anglais dans cette table (l'anglais ne déclenche jamais de
-- localisation côté client).
alter table public.localized_cards
  drop constraint if exists localized_cards_lang_not_en;
alter table public.localized_cards
  add constraint localized_cards_lang_not_en check (lang <> 'en');

-- Lecture publique : un deck public doit être consultable sans login ; ce sont des
-- URLs d'images publiques, pas de données privées. AUCUNE policy d'écriture — la
-- table n'est écrite que par le seed via la service-role key (bypasse la RLS).
alter table public.localized_cards enable row level security;

drop policy if exists localized_cards_select_all on public.localized_cards;
create policy localized_cards_select_all
  on public.localized_cards
  for select
  using (true);

grant select on public.localized_cards to anon, authenticated;

-- Écriture : service_role BYPASS la RLS mais Postgres exige quand même un GRANT de
-- table (rolbypassrls ne dispense pas des privilèges ACL). Sans ce grant, le seed
-- (upsert via service-role key) échoue avec "permission denied for table
-- localized_cards" — constaté en local, cf. le même trou pré-existant sur
-- custom_cards. select est nécessaire pour la résolution on-conflict de l'upsert.
-- Seul service_role écrit (aucune policy insert/update/delete).
grant select, insert, update on public.localized_cards to service_role;


-- -----------------------------------------------------------------------------
-- 2) 20260723120000_rename_cards_to_card_entries
-- -----------------------------------------------------------------------------

-- Rename the user-owned cards table (deck/collection/wishlist entries) to
-- card_entries, freeing the name `cards` and disambiguating it from the new
-- Scryfall catalog tables. ALTER … RENAME follows FKs/indexes/policy attachment
-- automatically (policies and views are stored by OID and print under the new
-- name); what it does NOT rewrite is the raw SQL text stored inside function
-- bodies. We recreate those functions, plus the public-read policies (for
-- documentation clarity / defense in depth), against card_entries.

alter table if exists public.cards rename to card_entries;

-- 1. count_distinct_public_cards (20260705120000): body selects `from public.cards`.
create or replace function public.count_distinct_public_cards(owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct scryfall_id)::int
  from public.card_entries
  where owner_id = owner
    and wishlist = false;
$$;

-- 2. Public-read policies. Recreate on the renamed table with the newest
-- predicates (superseding whatever RENAME carried over under the same names).

-- Newest version: 20260720120000_add_deck_visibility_and_precons.sql.
drop policy if exists "Public can view deck cards" on public.card_entries;
create policy "Public can view deck cards"
  on public.card_entries for select
  to anon, authenticated
  using (
    deck_id is not null
    and exists (
      select 1 from public.decks d
      where d.id = card_entries.deck_id
        and (
          (d.owner_id is null and d.is_public)
          or (d.is_public and public.profile_is_public(d.owner_id))
          or auth.uid() = d.owner_id
        )
    )
  );

-- Newest version: 20260720140000_fix_private_deck_card_leak.sql (scopes to
-- deck_id is null so deck cards are governed solely by the policy above).
drop policy if exists "Public can view collection cards" on public.card_entries;
create policy "Public can view collection cards"
  on public.card_entries for select
  to anon, authenticated
  using (
    owner_id is not null
    and deck_id is null
    and (public.profile_is_public(owner_id) or auth.uid() = owner_id)
  );

-- 3. Usage-quota trigger functions (20260711120000_add_usage_quotas.sql) count
-- `from public.cards`. Recreate them to read card_entries. Trigger names/
-- attachment are preserved by RENAME; only the function bodies changed.

create or replace function public.recompute_user_usage(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_usage (owner_id, deck_count, card_count)
  values (
    uid,
    (select count(*) from public.decks where owner_id = uid),
    (select count(*) from public.card_entries where owner_id = uid)
  )
  on conflict (owner_id) do update
    set deck_count = excluded.deck_count,
        card_count = excluded.card_count;
end;
$$;

-- 3b. Maintien du compteur de cartes de COLLECTION (owner_id posé uniquement).
create or replace function public.trg_cards_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.owner_id is not null then
    insert into public.user_usage (owner_id, card_count)
    values (new.owner_id, 1)
    on conflict (owner_id) do update
      set card_count = public.user_usage.card_count + 1;
  elsif tg_op = 'DELETE' and old.owner_id is not null then
    update public.user_usage
      set card_count = greatest(card_count - 1, 0)
      where owner_id = old.owner_id;
  end if;
  return null;
end;
$$;

-- 3c. Plafonds + rate limit cartes (BEFORE INSERT).
create or replace function public.trg_cards_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_card_count integer;
  coll_count      integer;
  recent_count    integer;
begin
  -- Plafond cartes/deck : count(*) borné par 5000, appuyé sur l'index deck_id.
  if new.deck_id is not null then
    select count(*) into deck_card_count
      from public.card_entries where deck_id = new.deck_id;
    if deck_card_count >= 5000 then
      raise exception 'WIZCARD_LIMIT_DECK_CARDS: limite de 5000 cartes par deck atteinte';
    end if;
  end if;

  if new.owner_id is not null then
    -- Plafond collection : lecture O(1) sur user_usage.
    select card_count into coll_count
      from public.user_usage where owner_id = new.owner_id;
    if coalesce(coll_count, 0) >= 250000 then
      raise exception 'WIZCARD_LIMIT_COLLECTION: limite de 250000 cartes en collection atteinte';
    end if;

    -- Rate limit : fenêtre récente bornée par la limite elle-même (~50k max).
    select count(*) into recent_count
      from public.card_entries
      where owner_id = new.owner_id
        and created_at > now() - interval '15 minutes';
    if recent_count >= 50000 then
      raise exception 'WIZCARD_RATE_CARDS: débit d''insertion trop élevé, réessayez dans quelques minutes';
    end if;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3) 20260723120001_create_card_catalog
-- -----------------------------------------------------------------------------

-- Scryfall card catalog mirror. Public read data (like localized_cards); written
-- only by the seed via the service-role key. Modeled on Scryfall's identity levels:
-- card_definitions (oracle/gameplay) -> card_prints (edition x language) ->
-- card_definition_faces (gameplay, per oracle) + card_print_faces (visual/localized,
-- per print), joined on (oracle_id, face_index); card_parts holds oracle->oracle
-- relations (tokens/meld/combo).

create table if not exists public.card_definitions (
  oracle_id      uuid primary key,
  name           text not null,
  type_line      text,
  oracle_text    text,
  mana_cost      text,
  cmc            numeric,
  colors         text[],
  color_identity text[],
  keywords       text[],
  power          text,
  toughness      text,
  loyalty        text,
  defense        text,
  legalities     jsonb,
  reserved       boolean,
  edhrec_rank    int,
  layout         text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.card_prints (
  id                uuid primary key,
  oracle_id         uuid not null references public.card_definitions(oracle_id) on delete cascade,
  set               text not null,
  collector_number  text not null,
  lang              text not null,
  rarity            text,
  released_at       date,
  artist            text,
  border_color      text,
  frame             text,
  image_status      text,
  image_uris        jsonb,
  finishes          text[],
  promo             boolean,
  reprint           boolean,
  variation         boolean,
  digital           boolean,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  updated_at        timestamptz not null default now()
);

alter table public.card_prints
  drop constraint if exists card_prints_lang_check;
alter table public.card_prints
  add constraint card_prints_lang_check check (lang in ('en', 'fr'));

create unique index if not exists card_prints_set_number_lang_key
  on public.card_prints (set, collector_number, lang);
create index if not exists card_prints_oracle_id_idx
  on public.card_prints (oracle_id);

create table if not exists public.card_definition_faces (
  oracle_id    uuid not null references public.card_definitions(oracle_id) on delete cascade,
  face_index   smallint not null,
  name         text,
  type_line    text,
  oracle_text  text,
  mana_cost    text,
  colors       text[],
  power        text,
  toughness    text,
  loyalty      text,
  primary key (oracle_id, face_index)
);

create table if not exists public.card_print_faces (
  print_id          uuid not null references public.card_prints(id) on delete cascade,
  face_index        smallint not null,
  artist            text,
  illustration_id   uuid,
  image_uris        jsonb,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  primary key (print_id, face_index)
);

create table if not exists public.card_parts (
  oracle_id          uuid not null references public.card_definitions(oracle_id) on delete cascade,
  related_oracle_id  uuid not null,   -- NO strict FK: may cite an un-seeded oracle
  component          text not null,
  name               text,
  type_line          text,
  primary key (oracle_id, related_oracle_id, component)
);

-- RLS: public read; no write policies (service_role bypasses RLS but still needs grants).
alter table public.card_definitions      enable row level security;
alter table public.card_prints           enable row level security;
alter table public.card_definition_faces enable row level security;
alter table public.card_print_faces      enable row level security;
alter table public.card_parts            enable row level security;

drop policy if exists card_definitions_select_all on public.card_definitions;
create policy card_definitions_select_all on public.card_definitions for select using (true);
drop policy if exists card_prints_select_all on public.card_prints;
create policy card_prints_select_all on public.card_prints for select using (true);
drop policy if exists card_definition_faces_select_all on public.card_definition_faces;
create policy card_definition_faces_select_all on public.card_definition_faces for select using (true);
drop policy if exists card_print_faces_select_all on public.card_print_faces;
create policy card_print_faces_select_all on public.card_print_faces for select using (true);
drop policy if exists card_parts_select_all on public.card_parts;
create policy card_parts_select_all on public.card_parts for select using (true);

grant select
  on public.card_definitions, public.card_prints, public.card_definition_faces, public.card_print_faces, public.card_parts
  to anon, authenticated;
grant select, insert, update, delete
  on public.card_definitions, public.card_prints, public.card_definition_faces, public.card_print_faces, public.card_parts
  to service_role;


-- -----------------------------------------------------------------------------
-- 4) 20260723120002_drop_localized_cards
-- -----------------------------------------------------------------------------

-- localized_cards is absorbed by card_prints (lang='fr') + card_faces. Drop it.
drop table if exists public.localized_cards;


-- -----------------------------------------------------------------------------
-- 5) 20260724120000_add_print_external_ids
-- -----------------------------------------------------------------------------

-- External marketplace/game ids, per print (verified: differ EN vs FR, usually null in FR).
-- Additive + nullable so a from-scratch apply and a re-seed both work.
alter table public.card_prints add column if not exists multiverse_ids int[];
alter table public.card_prints add column if not exists mtgo_id int;
alter table public.card_prints add column if not exists arena_id int;
alter table public.card_prints add column if not exists tcgplayer_id int;
alter table public.card_prints add column if not exists cardmarket_id int;

-- Lookup indexes for the external-id read paths (partial: skip nulls).
create index if not exists card_prints_mtgo_id_idx on public.card_prints (mtgo_id) where mtgo_id is not null;
create index if not exists card_prints_arena_id_idx on public.card_prints (arena_id) where arena_id is not null;
create index if not exists card_prints_tcgplayer_id_idx on public.card_prints (tcgplayer_id) where tcgplayer_id is not null;
create index if not exists card_prints_cardmarket_id_idx on public.card_prints (cardmarket_id) where cardmarket_id is not null;
create index if not exists card_prints_multiverse_ids_idx on public.card_prints using gin (multiverse_ids);


-- -----------------------------------------------------------------------------
-- 6) 20260724120001_create_card_sets
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- 7) 20260724120002_restore_table_grants
-- -----------------------------------------------------------------------------

-- Restore explicit table-level grants for anon/authenticated.
--
-- Contexte : plusieurs tables ne recevaient leurs privilèges que via la default
-- ACL du bootstrap Supabase (`alter default privileges … grant all on tables to
-- anon, authenticated`). Une base dont la default ACL a dérivé (rôles recréés,
-- restore partiel) crée donc des tables SANS `SELECT`, et PostgREST répond
-- 42501 « permission denied for table … » alors que les policies RLS existent
-- et sont correctes.
--
-- Les tables plus récentes (decks, card_prints, card_sets, catalogue…) ne sont
-- pas touchées parce que leur migration d'origine grantait explicitement. On
-- aligne ici les tables historiques pour que le schéma soit auto-suffisant et
-- ne dépende plus d'un état implicite du cluster.
--
-- SÉCURITÉ : le privilège table n'ouvre aucune donnée par lui-même — RLS est
-- actif (relrowsecurity = true) sur les 6 tables et les policies SELECT sont
-- déjà en place. Le grant ne fait que permettre à PostgREST d'atteindre la
-- table ; c'est la policy qui filtre les lignes.
--
-- Idempotent : `grant` est un no-op si le privilège est déjà présent.

-- 1. Tables lues par le propriétaire connecté et/ou le public via RLS.
grant select on public.profiles              to anon, authenticated;
grant select on public.deck_folders          to anon, authenticated;
grant select on public.custom_cards          to anon, authenticated;
grant select on public.custom_card_sources   to anon, authenticated;

-- 2. Tables strictement propriétaire : pas d'accès anon (aucune policy anon).
grant select on public.user_usage            to authenticated;
grant select on public.email_change_requests to authenticated;

-- 3. card_entries : le propriétaire lit toute sa ligne (prix inclus) via le
--    rôle `authenticated` + policy owner. On NE grant PAS `select` global à
--    `anon` : 20260710120000_fix_purchase_price_leak.sql l'a délibérément
--    révoqué et re-granté colonne par colonne pour que `purchase_price` ne
--    fuite pas sur les deck cards publiques. Ce grant-ci restaure uniquement
--    le privilège `authenticated` que cette migration supposait acquis.
grant select on public.card_entries to authenticated;

-- 4. Écritures : mêmes tables, mêmes rôles qu'avant la dérive. Les plafonds et
--    le rate-limit restent assurés par les triggers (trg_cards_limit) et les
--    policies WITH CHECK, pas par l'absence de privilège.
--
--    NB : on ne grant volontairement PAS `insert, update` au niveau TABLE sur
--    card_entries. 20260711120000_add_usage_quotas.sql (et le bootstrap) ont
--    révoqué le privilège table puis re-granté colonne par colonne (15 des 16
--    colonnes, purchase_price exclu). Un grant table-level écraserait cette
--    restriction et rouvrirait la fuite de prix. Le DELETE, lui, n'a pas de
--    granularité colonne et doit être rendu au propriétaire.
grant delete                 on public.card_entries          to authenticated;
grant insert, update, delete on public.deck_folders          to authenticated;
grant insert, update         on public.profiles              to authenticated;
grant insert, update, delete on public.email_change_requests to authenticated;

-- 5. Séquences éventuelles (identity/serial) pour que les INSERT aboutissent.
grant usage, select on all sequences in schema public to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8) 20260724120003_restore_decks_write_grants
-- -----------------------------------------------------------------------------

-- Restore write privileges on public.decks for authenticated users.
--
-- Suite de 20260724120002_restore_table_grants.sql : cette migration-là avait
-- rendu les SELECT manquants mais laissé les écritures de `decks` de côté,
-- parce que la table répondait déjà correctement en lecture. Résultat : créer
-- un deck (import Moxfield) partait en `POST /rest/v1/decks` → 403 42501, le
-- deck n'était jamais inséré et la redirection tombait sur « deck not found ».
--
-- Même cause racine que la migration précédente : `decks` ne tenait ses
-- privilèges que de la default ACL du bootstrap Supabase, qui a dérivé sur ce
-- cluster et ne grant plus rien aux rôles applicatifs.
--
-- SÉCURITÉ : les policies RLS INSERT/UPDATE/DELETE (« Users can insert/update/
-- delete their own decks ») existent déjà et contraignent owner_id = auth.uid().
-- Le grant ne fait qu'autoriser PostgREST à atteindre la table ; c'est la policy
-- qui décide de la ligne. Les plafonds (100 decks) et le rate-limit restent
-- assurés par les triggers decks_limit_before / decks_usage_after, qui sont
-- SECURITY DEFINER et donc insensibles aux privilèges de l'appelant.
--
-- Contrairement à card_entries, `decks` n'a AUCUN grant colonne d'écriture
-- (seuls SELECT/REFERENCES sont posés colonne par colonne) : il n'y a donc pas
-- de restriction fine à préserver ici, le grant table est le bon niveau.
--
-- `card_entries` n'est volontairement pas touchée : ses INSERT/UPDATE passent
-- déjà par des grants colonne (15 colonnes, created_at exclu pour que le
-- rate-limit ne soit pas contournable) et le 403 observé sur elle n'était qu'une
-- conséquence de l'échec d'insertion du deck parent.
--
-- Idempotent : `grant` est un no-op si le privilège est déjà présent.

grant insert, update, delete on public.decks to authenticated;


-- -----------------------------------------------------------------------------
-- Enregistrement dans l'historique des migrations (pour que `supabase migration
-- list` / les futurs diffs voient ces 8 versions comme appliquées).
-- -----------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260722120000', 'add_localized_cards'),
  ('20260723120000', 'rename_cards_to_card_entries'),
  ('20260723120001', 'create_card_catalog'),
  ('20260723120002', 'drop_localized_cards'),
  ('20260724120000', 'add_print_external_ids'),
  ('20260724120001', 'create_card_sets'),
  ('20260724120002', 'restore_table_grants'),
  ('20260724120003', 'restore_decks_write_grants')
on conflict (version) do nothing;

commit;
