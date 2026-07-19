-- Per-deck visibility + MTGJSON preconstructed decks.
--
-- Two changes that must ship together:
--   1. decks.is_public — an explicit per-deck sharing toggle (default true, so
--      existing decks keep exactly their current visibility). It combines with
--      the profile gate from 20260713130000: a user deck is publicly readable
--      only when the OWNER PROFILE is public AND the deck itself is public.
--   2. Preconstructed decks (source='mtgjson') live in this same table with
--      owner_id NULL. profile_is_public(NULL) is false, so the existing
--      policies would hide them — hence the dedicated owner_id IS NULL branch.
--
-- RLS discriminates on owner_id/is_public, never on `source`: `source` exists
-- for the sync (idempotent upsert key) and for display (the "Precon" badge).
--
-- Idempotent + reversible: columns use IF NOT EXISTS; policies are
-- drop-if-exists then recreated under the same names.

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.decks
  add column if not exists is_public boolean not null default true;

alter table public.decks
  add column if not exists source text not null default 'user';

alter table public.decks
  add column if not exists source_deck_id text;

alter table public.decks
  add column if not exists source_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_source_check'
  ) then
    alter table public.decks
      add constraint decks_source_check check (source in ('user', 'mtgjson'));
  end if;
end $$;

-- Preconstructed decks have no owner; user decks always do.
alter table public.decks alter column owner_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_owner_matches_source'
  ) then
    alter table public.decks
      add constraint decks_owner_matches_source
      check ((source = 'user') = (owner_id is not null));
  end if;
end $$;

-- Idempotent upsert key for the MTGJSON sync (source_deck_id = MTGJSON fileName).
create unique index if not exists decks_source_deck_key
  on public.decks (source, source_deck_id)
  where source_deck_id is not null;

-- Search filters on source; the search list orders by updated_at.
create index if not exists decks_source_idx on public.decks (source);

-- ─── Trigger Fix ────────────────────────────────────────────────────────────

-- Now that decks.owner_id is nullable (for precons), the trg_decks_usage() trigger
-- needs to skip inserting into user_usage for NULL owner_id (precons don't count
-- against quotas). Recreate the function to check owner_id is not null.
create or replace function public.trg_decks_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      insert into public.user_usage (owner_id, deck_count)
      values (new.owner_id, 1)
      on conflict (owner_id) do update
        set deck_count = public.user_usage.deck_count + 1;
    end if;
  elsif tg_op = 'DELETE' then
    if old.owner_id is not null then
      update public.user_usage
        set deck_count = greatest(deck_count - 1, 0)
        where owner_id = old.owner_id;
    end if;
  end if;
  return null; -- AFTER trigger : valeur de retour ignorée
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

-- Enable anon/authenticated to SELECT from decks (RLS policies gate the rows).
grant select on public.decks to anon, authenticated;

-- decks: precons (no owner) are public on their own is_public flag; user decks
-- additionally require the owner's profile to be public. Owner always sees own.
drop policy if exists "Public can view all decks" on public.decks;
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (
    (owner_id is null and is_public)
    or (is_public and public.profile_is_public(owner_id))
    or auth.uid() = owner_id
  );

-- cards belonging to a deck inherit that deck's visibility predicate.
drop policy if exists "Public can view deck cards" on public.cards;
create policy "Public can view deck cards"
  on public.cards for select
  to anon, authenticated
  using (
    deck_id is not null
    and exists (
      select 1 from public.decks d
      where d.id = cards.deck_id
        and (
          (d.owner_id is null and d.is_public)
          or (d.is_public and public.profile_is_public(d.owner_id))
          or auth.uid() = d.owner_id
        )
    )
  );

-- NOTE: the "Public can view collection cards" policy (owner_id set, no
-- deck_id) is deliberately left untouched — collection/wishlist visibility is
-- still governed solely by the profile gate.
