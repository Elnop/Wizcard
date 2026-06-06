create index if not exists custom_cards_oracle_text_trgm_idx
  on public.custom_cards using gin (oracle_text gin_trgm_ops)
  where oracle_text is not null;
