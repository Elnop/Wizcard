-- Fix: purchase_price leaked to anonymous visitors.
--
-- Two problems: (1) the "Public can view collection cards" policy
-- (USING owner_id is not null) opened the whole cards table to anon, bypassing
-- the price-free public_collection_cards view; (2) anon holds a bootstrap
-- table-level SELECT grant on cards, so even after dropping that policy, deck
-- cards (readable via the "Public can view deck cards" policy) still exposed
-- purchase_price through select('*'). A column-level REVOKE cannot narrow a
-- table-level grant, so the price kept leaking on deck cards.
--
-- Fix: (a) drop the redundant collection policy; (b) revoke anon's blanket
-- table SELECT and re-grant SELECT on every column EXCEPT purchase_price. Anon
-- must then request explicit columns (the app's fetchDeckCardRows is updated to
-- do so) — an explicit-column request is authorized by the column grants; a
-- select('*') would 403. The owner keeps the full table grant via the
-- `authenticated` role and reads the price through the unchanged owner RLS
-- policy.
--
-- Idempotent + reversible.

-- 1. Remove the over-broad public collection read (keep the deck-cards one).
drop policy if exists "Public can view collection cards" on public.cards;

-- 2. Revoke anon's blanket table SELECT, re-grant every column except
--    purchase_price. Deck viewing uses an explicit column list (see
--    src/lib/supabase/queries/decks.ts::fetchDeckCardRows).
revoke select on public.cards from anon;
grant select (
  id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
  language, alter, proxy, tags, for_trade, deck_id, wishlist
) on public.cards to anon;
