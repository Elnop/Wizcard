alter table public.custom_cards
  add column if not exists image_hash text;

create index if not exists custom_cards_image_hash_source_idx
  on public.custom_cards (source_id, image_hash)
  where image_hash is not null;
