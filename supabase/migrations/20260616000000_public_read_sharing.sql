-- Public read sharing: anyone (anonymous or authenticated) may READ decks,
-- deck folders, and cards. Writes remain owner-only (existing policies untouched).
-- These permissive SELECT policies are combined with the existing owner policies
-- via OR, so the authenticated owner dashboard keeps working unchanged.
-- Reversible: drop the four policies + the view below.

-- decks: fully public for reading
create policy "Public can view all decks"
  on public.decks for select
  to anon, authenticated
  using (true);

-- deck_folders: public (the public decks list needs folder names/hierarchy)
create policy "Public can view all deck folders"
  on public.deck_folders for select
  to anon, authenticated
  using (true);

-- cards belonging to a deck are public (they ARE the deck)
create policy "Public can view deck cards"
  on public.cards for select
  to anon, authenticated
  using (deck_id is not null);

-- collection cards are public (wishlist included, per product decision)
create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (owner_id is not null);

-- Public collection view: every column EXCEPT purchase_price (sensitive).
-- security_invoker = true so the underlying cards RLS still applies; omitting
-- purchase_price from the projection makes it unfetchable through this view.
create view public.public_collection_cards
  with (security_invoker = true) as
  select
    id,
    owner_id,
    scryfall_id,
    date_added,
    is_foil,
    foil_type,
    condition,
    language,
    for_trade,
    alter,
    proxy,
    tags,
    deck_id,
    wishlist
  from public.cards
  where owner_id is not null;

grant select on public.public_collection_cards to anon, authenticated;
