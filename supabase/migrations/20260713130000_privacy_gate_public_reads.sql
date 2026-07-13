-- Enforce profile privacy on ALL public-readable user data.
--
-- Context: 20260713120000 added profiles.is_public and gated the profiles
-- SELECT policy, but the public-read policies on decks / deck_folders / cards
-- (from 20260616000000_public_read_sharing + 20260710120000_fix_purchase_price_leak)
-- still expose a private user's decks, folders, collection and wishlist to anon
-- by owner_id. The Settings "Profil public" toggle promises these become
-- invisible when private — this migration makes that true at the RLS layer.
--
-- Approach: a SECURITY DEFINER helper resolves whether a given owner's profile
-- is public (bypassing the profiles RLS so the check works for anon), and each
-- public-read policy is rewritten to additionally require the owner to be public
-- OR the requester to be the owner (owner keeps full access to their own data).
--
-- Idempotent + reversible: helper is create-or-replace; policies are
-- drop-if-exists then recreate with the same names.

-- Resolve profile visibility without tripping profiles' own RLS. A missing
-- profile row is treated as NOT public (fail closed). STABLE: same result within
-- a statement; SECURITY DEFINER so anon can evaluate it inside a policy.
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

-- decks: public read only when the owner's profile is public (owner always sees own).
drop policy if exists "Public can view all decks" on public.decks;
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (public.profile_is_public(owner_id) or auth.uid() = owner_id);

-- deck_folders: same gate.
drop policy if exists "Public can view all deck folders" on public.deck_folders;
create policy "Public can view all deck folders"
  on public.deck_folders for select
  to anon, authenticated
  using (public.profile_is_public(owner_id) or auth.uid() = owner_id);

-- cards: a row is either a collection/wishlist card (owner_id set) or a deck
-- card (deck_id set, owner resolved through the deck). Gate both shapes on the
-- owning profile's visibility. Keeps the deck_id-not-null intent (only shared
-- cards are candidates) while adding the privacy predicate.
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

-- The public_collection_cards view (security_invoker) reads cards under the
-- caller's RLS. Collection/wishlist cards have owner_id set but no deck_id, so
-- the deck-cards policy above does NOT cover them — add an explicit
-- owner-visibility policy so a public profile's collection/wishlist stays
-- readable and a private one does not.
drop policy if exists "Public can view collection cards" on public.cards;
create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (
    owner_id is not null
    and (public.profile_is_public(owner_id) or auth.uid() = owner_id)
  );
