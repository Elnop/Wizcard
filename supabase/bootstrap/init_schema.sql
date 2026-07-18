-- Bootstrap migration: creates the final schema from scratch.
-- Use this to initialize a fresh database without replaying all previous migrations.
-- NOT intended to run on an existing database that already has the cards/decks tables.

-- Decks table
create table public.decks (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  format      text        check (format is null or format in (
    'standard', 'modern', 'pioneer', 'legacy', 'vintage',
    'commander', 'pauper', 'draft', 'limited', 'oathbreaker', 'brawl'
  )),
  description text,
  cover_art_url text,
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

-- Cards table (collection cards + deck cards unified)
create table public.cards (
  id             uuid        primary key default gen_random_uuid(),
  owner_id       uuid        references auth.users(id) on delete cascade,
  scryfall_id    text        not null,
  date_added     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  is_foil        boolean,
  foil_type      text        check (foil_type is null or foil_type in ('foil', 'etched')),
  condition      text        check (condition is null or condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  language       text,
  purchase_price text,
  for_trade      boolean     default false,
  wishlist       boolean     not null default false,
  alter          boolean,
  proxy          boolean,
  tags           text[],
  deck_id        uuid        references public.decks(id) on delete cascade,
  constraint cards_owner_or_deck check (owner_id is not null or deck_id is not null)
);

-- Index for fetchCollection queries (covers common columns to avoid heap fetches)
create index on public.cards (owner_id, scryfall_id);
create index on public.cards (owner_id) include (scryfall_id, id, date_added);
create index on public.cards (deck_id) where deck_id is not null;

alter table public.cards enable row level security;

create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can insert their own cards"
  on public.cards for insert
  with check (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can update their own cards"
  on public.cards for update
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can delete their own cards"
  on public.cards for delete
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  description text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public can view profiles"
  on public.profiles for select
  to anon, authenticated using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Unique, auto-generated default nickname (wizard_<hex> from the user id).
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname))
  where nickname is not null;

create function public.default_nickname_base(uid uuid)
  returns text
  language sql
  immutable
as $$
  select 'wizard_' || substr(md5(uid::text), 1, 6);
$$;

create function public.generate_unique_nickname(uid uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text;
  hexlen int := 6;
begin
  loop
    candidate := 'wizard_' || substr(md5(uid::text), 1, hexlen);
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    hexlen := hexlen + 1;
    if hexlen > 32 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

-- ASCII-fold + charset-filter an OAuth display name into a CHECK-valid nickname
-- candidate, or null when nothing usable remains. STABLE (unaccent is STABLE).
create extension if not exists unaccent with schema public;

create function public.normalize_oauth_nickname(raw text)
  returns text
  language plpgsql
  stable
as $$
declare
  candidate text;
begin
  if raw is null then
    return null;
  end if;
  candidate := unaccent(raw);
  candidate := regexp_replace(candidate, '[^[:alnum:]._ -]', '', 'g');
  candidate := btrim(regexp_replace(candidate, '\s+', ' ', 'g'));
  candidate := btrim(substr(candidate, 1, 30));
  if char_length(candidate) < 3 then
    return null;
  end if;
  if lower(candidate) in (
    'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
  ) then
    return null;
  end if;
  return candidate;
end;
$$;

-- Collision-safe generator from an arbitrary text base: base as-is if free,
-- else _2, _3, ... (length-capped at 30 including suffix).
create function public.generate_unique_nickname(base text)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text := base;
  n int := 2;
  suffix text;
begin
  loop
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    suffix := '_' || n::text;
    candidate := substr(base, 1, 30 - char_length(suffix)) || suffix;
    n := n + 1;
    if n > 10000 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  base text;
begin
  base := public.normalize_oauth_nickname(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  if base is null then
    base := public.default_nickname_base(new.id);
  end if;

  insert into public.profiles (id, nickname)
    values (new.id, public.generate_unique_nickname(base))
    on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users
insert into public.profiles (id, nickname)
  select id, public.generate_unique_nickname(id) from auth.users
  on conflict (id) do nothing;

-- Avatars storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "public read avatars bucket"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write own avatar"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- Quotas anti-abus (volume de données). Défense en profondeur : ces triggers
-- s'appliquent même sur un appel PostgREST direct (bypass du JS client).
-- Limites : 1000 decks/user, 5000 cartes/deck, 250000 cartes/collection,
-- débit 50000 lignes/15min. Cf. docs/superpowers/specs/2026-07-11-quotas-anti-abus-design.md
-- =========================================================================

-- Le client ne doit jamais écrire created_at (sinon le rate limit est esquivable).
-- Un REVOKE de colonne ne peut PAS restreindre un GRANT de table préexistant
-- (même piège que 20260710000000 pour purchase_price/SELECT). On révoque donc
-- le privilège de table INSERT/UPDATE puis on le re-grant colonne par colonne,
-- SAUF created_at (posé uniquement par le default DB).
revoke insert, update on public.cards from anon, authenticated;
grant insert (
  id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
  language, purchase_price, for_trade, wishlist, alter, proxy, tags, deck_id
) on public.cards to anon, authenticated;
grant update (
  id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
  language, purchase_price, for_trade, wishlist, alter, proxy, tags, deck_id
) on public.cards to anon, authenticated;

-- Index pour le count de la fenêtre de rate limit (borné par ~50k lignes récentes).
create index cards_owner_created_at_idx
  on public.cards (owner_id, created_at)
  where owner_id is not null;

-- 2. Compteurs dénormalisés (pattern rollup counter — check O(1) au lieu de count(*)).
create table public.user_usage (
  owner_id   uuid    primary key references auth.users(id) on delete cascade,
  deck_count integer not null default 0,
  card_count integer not null default 0
);

alter table public.user_usage enable row level security;
-- Lecture par le propriétaire uniquement (utile si l'UI veut afficher l'usage).
create policy "Users can view their own usage"
  on public.user_usage for select
  using (auth.uid() = owner_id);
-- Aucune policy insert/update/delete : seuls les triggers SECURITY DEFINER écrivent.

-- 3. Recalcul depuis la vérité terrain (backfill + réparation d'un compteur dérivé).
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

-- 4a. Maintien du compteur de decks.
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
  return null; -- AFTER trigger : valeur de retour ignorée
end;
$$;

-- 4b. Maintien du compteur de cartes de COLLECTION (owner_id posé uniquement).
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

-- 5a. Plafond decks/user (BEFORE INSERT, lecture O(1) sur user_usage).
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

-- 5b. Plafonds + rate limit cartes (BEFORE INSERT).
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
      from public.cards where deck_id = new.deck_id;
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

-- 6. Attacher les triggers.
create trigger decks_limit_before
  before insert on public.decks
  for each row execute function public.trg_decks_limit();

create trigger decks_usage_after
  after insert or delete on public.decks
  for each row execute function public.trg_decks_usage();

create trigger cards_limit_before
  before insert on public.cards
  for each row execute function public.trg_cards_limit();

create trigger cards_usage_after
  after insert or delete on public.cards
  for each row execute function public.trg_cards_usage();
