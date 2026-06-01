alter table public.custom_cards
  add column oracle_id   text,
  add column enriched_at timestamptz;

-- oracle_id matches Scryfall's own field naming convention
create index custom_cards_oracle_id_idx
  on public.custom_cards(oracle_id)
  where oracle_id is not null;
