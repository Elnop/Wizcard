-- Exact count of an owner's distinct public collection prints (scryfall_id),
-- for the profile Overview "unique cards" stat. security definer so it reads
-- past RLS the same way the public_collection_cards view exposes public rows;
-- it only ever returns an aggregate count, never row data.
create or replace function public.count_distinct_public_cards(owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct scryfall_id)::int
  from public.cards
  where owner_id = owner
    and wishlist = false;
$$;

grant execute on function public.count_distinct_public_cards(uuid) to anon, authenticated;
