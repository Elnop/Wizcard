-- Close a leak: a private deck's cards were readable by anon.
--
-- RLS policies for the same command are OR'd. "Public can view deck cards"
-- (rewritten in 20260720120000) correctly requires the parent deck to be
-- visible, but "Public can view collection cards" (from 20260713130000) grants
-- SELECT on ANY row with `owner_id is not null and profile_is_public(owner_id)`
-- — it never looks at deck_id or the deck's is_public.
--
-- Deck cards routinely have owner_id set: assigning a collection copy into a
-- deck (addCollectionCardToDeck / replaceDeckCardWithCollectionCopy) writes a
-- row carrying BOTH owner_id and deck_id. So for an owner with a PUBLIC
-- profile who marks a deck PRIVATE, the deck row was hidden while its cards
-- stayed readable — the whole decklist leaked.
--
-- Reproduced before this migration: anon saw 0 rows for the private deck but 1
-- row for its cards.
--
-- Fix: scope the collection policy to non-deck rows, which is precisely what
-- its own comment already claims ("Collection/wishlist cards have owner_id set
-- but no deck_id"). That assumption was documented but never enforced. Deck
-- cards remain covered by "Public can view deck cards", which gates on the
-- parent deck — so no legitimate access is lost.
--
-- Idempotent + reversible: drop-if-exists then recreate under the same name.

drop policy if exists "Public can view collection cards" on public.cards;
create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (
    owner_id is not null
    and deck_id is null
    and (public.profile_is_public(owner_id) or auth.uid() = owner_id)
  );
