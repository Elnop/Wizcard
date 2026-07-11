-- =========================================================================
-- Quotas anti-abus (volume de données). Défense en profondeur : ces triggers
-- s'appliquent même sur un appel PostgREST direct (bypass du JS client).
-- Limites : 1000 decks/user, 5000 cartes/deck, 250000 cartes/collection,
-- débit 50000 lignes/15min. Cf. docs/superpowers/specs/2026-07-11-quotas-anti-abus-design.md
-- =========================================================================

-- 1. Horodatage d'insertion NON falsifiable (le client fournit date_added,
--    donc on ne peut pas s'en servir pour le rate limit).
alter table public.cards
  add column created_at timestamptz not null default now();

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

-- 7. Backfill des utilisateurs existants.
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.recompute_user_usage(u.id);
  end loop;
end;
$$;
