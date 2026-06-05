alter table public.custom_cards
  add column if not exists card_type text not null default 'card'
    check (card_type in ('card', 'token', 'cardback'));

alter table public.custom_cards
  add column if not exists language text;

create index if not exists custom_cards_card_type_idx
  on public.custom_cards (card_type)
  where card_type != 'card';

create index if not exists custom_cards_language_idx
  on public.custom_cards (language)
  where language is not null;
