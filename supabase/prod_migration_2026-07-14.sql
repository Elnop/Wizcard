-- =============================================================================
-- WIZCARD — Script de migration PROD consolidé (à coller dans l'éditeur SQL prod)
-- Généré 2026-07-14. Applique les 5 migrations manquantes sur origin/deploy :
--   1) 20260711120000_add_usage_quotas
--   2) 20260713120000_add_profile_preferences
--   3) 20260713130000_privacy_gate_public_reads
--   4) 20260713140000_email_change_requests
--   5) 20260714120000_profile_field_constraints
--
-- Rendu IDEMPOTENT (rejouable) et TRANSACTIONNEL (tout ou rien).
-- Workflow: exécuter ce bloc, vérifier "COMMIT" OK, puis (voir la fin) synchroniser
-- supabase_migrations.schema_migrations et avancer la branche deploy.
--
-- ⚠️ AVANT DE LANCER — audit anti-échec de la migration 5 (CHECK sur données
-- existantes). Lancer d'abord ce SELECT read-only ; il DOIT renvoyer 0 partout :
--
--   select
--     count(*) filter (where char_length(nickname) not between 3 and 30)          as nick_len_bad,
--     count(*) filter (where nickname !~ '^[[:alnum:]._ -]+$')                     as nick_charset_bad,
--     count(*) filter (where lower(nickname) in
--       ('admin','api','settings','login','logout','signup','users','wizard','null','undefined')) as nick_reserved,
--     count(*) filter (where char_length(description) > 500)                        as desc_too_long
--   from public.profiles
--   where nickname is not null or description is not null;
--
--   Si une colonne > 0 : corriger/renommer ces lignes AVANT, sinon l'ADD CONSTRAINT
--   de l'étape 5 échouera et la transaction entière sera annulée.
-- =============================================================================

begin;

-- =============================================================================
-- 1) 20260711120000 — Quotas anti-abus
-- =============================================================================

-- Horodatage non falsifiable (idempotent).
alter table public.cards
  add column if not exists created_at timestamptz not null default now();

-- created_at ne doit jamais être écrit par le client : revoke table puis re-grant
-- colonne par colonne (sauf created_at). Rejouable tel quel.
revoke insert, update on public.cards from anon, authenticated;
grant insert (
  id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
  language, purchase_price, for_trade, wishlist, alter, proxy, tags, deck_id
) on public.cards to anon, authenticated;
grant update (
  id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
  language, purchase_price, for_trade, wishlist, alter, proxy, tags, deck_id
) on public.cards to anon, authenticated;

create index if not exists cards_owner_created_at_idx
  on public.cards (owner_id, created_at)
  where owner_id is not null;

-- Compteurs dénormalisés.
create table if not exists public.user_usage (
  owner_id   uuid    primary key references auth.users(id) on delete cascade,
  deck_count integer not null default 0,
  card_count integer not null default 0
);

alter table public.user_usage enable row level security;

drop policy if exists "Users can view their own usage" on public.user_usage;
create policy "Users can view their own usage"
  on public.user_usage for select
  using (auth.uid() = owner_id);

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
    (select count(*) from public.cards where owner_id = uid)
  )
  on conflict (owner_id) do update
    set deck_count = excluded.deck_count,
        card_count = excluded.card_count;
end;
$$;

create or replace function public.trg_decks_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_usage (owner_id, deck_count)
    values (new.owner_id, 1)
    on conflict (owner_id) do update
      set deck_count = public.user_usage.deck_count + 1;
  elsif tg_op = 'DELETE' then
    update public.user_usage
      set deck_count = greatest(deck_count - 1, 0)
      where owner_id = old.owner_id;
  end if;
  return null;
end;
$$;

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

create or replace function public.trg_decks_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare current_count integer;
begin
  select deck_count into current_count
    from public.user_usage where owner_id = new.owner_id;
  if coalesce(current_count, 0) >= 1000 then
    raise exception 'WIZCARD_LIMIT_DECKS: limite de 1000 decks atteinte';
  end if;
  return new;
end;
$$;

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
  if new.deck_id is not null then
    select count(*) into deck_card_count
      from public.cards where deck_id = new.deck_id;
    if deck_card_count >= 5000 then
      raise exception 'WIZCARD_LIMIT_DECK_CARDS: limite de 5000 cartes par deck atteinte';
    end if;
  end if;

  if new.owner_id is not null then
    select card_count into coll_count
      from public.user_usage where owner_id = new.owner_id;
    if coalesce(coll_count, 0) >= 250000 then
      raise exception 'WIZCARD_LIMIT_COLLECTION: limite de 250000 cartes en collection atteinte';
    end if;

    select count(*) into recent_count
      from public.cards
      where owner_id = new.owner_id
        and created_at > now() - interval '15 minutes';
    if recent_count >= 50000 then
      raise exception 'WIZCARD_RATE_CARDS: débit d''insertion trop élevé, réessayez dans quelques minutes';
    end if;
  end if;

  return new;
end;
$$;

-- Triggers : pas de CREATE TRIGGER IF NOT EXISTS en PG → drop-if-exists d'abord.
drop trigger if exists decks_limit_before on public.decks;
create trigger decks_limit_before
  before insert on public.decks
  for each row execute function public.trg_decks_limit();

drop trigger if exists decks_usage_after on public.decks;
create trigger decks_usage_after
  after insert or delete on public.decks
  for each row execute function public.trg_decks_usage();

drop trigger if exists cards_limit_before on public.cards;
create trigger cards_limit_before
  before insert on public.cards
  for each row execute function public.trg_cards_limit();

drop trigger if exists cards_usage_after on public.cards;
create trigger cards_usage_after
  after insert or delete on public.cards
  for each row execute function public.trg_cards_usage();

-- Backfill (idempotent via recompute_user_usage upsert).
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.recompute_user_usage(u.id);
  end loop;
end;
$$;

-- =============================================================================
-- 2) 20260713120000 — Préférences de profil (déjà idempotent d'origine)
-- =============================================================================

alter table public.profiles
  add column if not exists language text not null default 'fr',
  add column if not exists price_currency text not null default 'eur',
  add column if not exists show_prices boolean not null default true,
  add column if not exists theme_preference text not null default 'system',
  add column if not exists is_public boolean not null default true;

alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles
  add constraint profiles_language_check check (language in ('en', 'fr'));

alter table public.profiles drop constraint if exists profiles_price_currency_check;
alter table public.profiles
  add constraint profiles_price_currency_check check (price_currency in ('eur', 'usd'));

alter table public.profiles drop constraint if exists profiles_theme_preference_check;
alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));

drop policy if exists "Public can view profiles" on public.profiles;
drop policy if exists "Visible profiles are viewable" on public.profiles;
create policy "Visible profiles are viewable"
  on public.profiles for select
  to anon, authenticated
  using (is_public or auth.uid() = id);

-- =============================================================================
-- 3) 20260713130000 — Privacy gate sur les lectures publiques (déjà idempotent)
-- =============================================================================

create or replace function public.profile_is_public(uid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce((select is_public from public.profiles where id = uid), false);
$$;

grant execute on function public.profile_is_public(uuid) to anon, authenticated;

drop policy if exists "Public can view all decks" on public.decks;
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (public.profile_is_public(owner_id) or auth.uid() = owner_id);

drop policy if exists "Public can view all deck folders" on public.deck_folders;
create policy "Public can view all deck folders"
  on public.deck_folders for select
  to anon, authenticated
  using (public.profile_is_public(owner_id) or auth.uid() = owner_id);

drop policy if exists "Public can view deck cards" on public.cards;
create policy "Public can view deck cards"
  on public.cards for select
  to anon, authenticated
  using (
    deck_id is not null
    and exists (
      select 1 from public.decks d
      where d.id = cards.deck_id
        and (public.profile_is_public(d.owner_id) or auth.uid() = d.owner_id)
    )
  );

drop policy if exists "Public can view collection cards" on public.cards;
create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (
    owner_id is not null
    and (public.profile_is_public(owner_id) or auth.uid() = owner_id)
  );

-- =============================================================================
-- 4) 20260713140000 — email_change_requests (déjà idempotent d'origine)
-- =============================================================================

create table if not exists public.email_change_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_change_requests_token_hash_idx
  on public.email_change_requests (token_hash);

create index if not exists email_change_requests_user_id_idx
  on public.email_change_requests (user_id);

alter table public.email_change_requests enable row level security;
-- Volontairement aucune policy : service-role uniquement.

-- =============================================================================
-- 5) 20260714120000 — Contraintes de champ profil (nickname/description)
--    ⚠️ Valide les lignes existantes → l'audit en tête doit être à 0.
-- =============================================================================

-- Fix pré-contrainte du seul nickname prod non conforme constaté le 2026-07-14 :
-- 'Shiza/Teddy' (le '/' est hors charset). Idempotent : ciblé par valeur exacte,
-- donc no-op si déjà corrigé (ce qui est le cas si la contrainte a déjà été posée).
-- Le '/' est remplacé par '-' (substitut neutre, préserve la lisibilité du pseudo).
update public.profiles
  set nickname = 'Shiza-Teddy'
  where nickname = 'Shiza/Teddy';

alter table public.profiles drop constraint if exists profiles_nickname_valid;
alter table public.profiles drop constraint if exists profiles_description_len;

alter table public.profiles
  add constraint profiles_nickname_valid check (
    nickname is null or (
      char_length(nickname) between 3 and 30
      and nickname ~ '^[[:alnum:]._ -]+$'
      and lower(nickname) not in (
        'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
      )
    )
  ),
  add constraint profiles_description_len check (
    description is null or char_length(description) <= 500
  );

-- =============================================================================
-- 6) Synchro du registre de migrations (pour que `db push` reste aligné).
--    name = nom de fichier sans .sql (convention Supabase).
-- =============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260711120000', 'add_usage_quotas'),
  ('20260713120000', 'add_profile_preferences'),
  ('20260713130000', 'privacy_gate_public_reads'),
  ('20260713140000', 'email_change_requests'),
  ('20260714120000', 'profile_field_constraints')
on conflict (version) do nothing;

commit;

-- =============================================================================
-- APRÈS un COMMIT réussi (hors transaction, côté git) :
--   git checkout deploy && git merge --ff-only main && git push origin deploy
-- pour que le prochain diff main..deploy reste juste.
-- =============================================================================
