-- Fix: purchase_price leaked to anonymous visitors.
--
-- The "Public can view collection cards" policy (USING owner_id is not null)
-- opened the entire public.cards table — including purchase_price — to anon,
-- bypassing the purchase_price-free public_collection_cards view. Deck cards can
-- also carry purchase_price and are read by anon via the deck-cards policy with
-- select('*'), so dropping the policy alone is insufficient.
--
-- Fix: drop the redundant collection policy AND revoke SELECT on just the
-- purchase_price column for anon. select('*') keeps working (PostgREST returns
-- only granted columns); the price is unreadable to anon on every row. The owner
-- reads it as `authenticated` via the existing owner RLS policy (unchanged).
--
-- Idempotent + reversible.

-- 1. Remove the over-broad public collection read (kept the deck-cards one).
drop policy if exists "Public can view collection cards" on public.cards;

-- 2. Column-level revoke: anon can read every column of cards EXCEPT
--    purchase_price. Deck viewing (from('cards').select('*')) is unaffected.
revoke select (purchase_price) on public.cards from anon;
