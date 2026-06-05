alter table public.custom_cards
  add column if not exists colors         text[] not null default '{}',
  add column if not exists color_identity text[] not null default '{}',
  add column if not exists cmc            numeric,
  add column if not exists type_line      text,
  add column if not exists mana_cost      text,
  add column if not exists oracle_text    text,
  add column if not exists rarity         text,
  add column if not exists set_name       text,
  add column if not exists artist         text;

create index if not exists custom_cards_colors_idx
  on public.custom_cards using gin (colors)
  where array_length(colors, 1) > 0;

create index if not exists custom_cards_cmc_idx
  on public.custom_cards (cmc)
  where cmc is not null;
