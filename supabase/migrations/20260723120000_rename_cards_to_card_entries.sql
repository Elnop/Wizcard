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
