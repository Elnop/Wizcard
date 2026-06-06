create extension if not exists pg_trgm;

create index if not exists custom_cards_name_trgm_idx
  on public.custom_cards using gin (name gin_trgm_ops);

create index if not exists custom_cards_type_line_trgm_idx
  on public.custom_cards using gin (type_line gin_trgm_ops)
  where type_line is not null;

create index if not exists custom_cards_tags_gin_idx
  on public.custom_cards using gin (tags);

create index if not exists custom_cards_rarity_idx
  on public.custom_cards (rarity)
  where rarity is not null;
