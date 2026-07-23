-- External marketplace/game ids, per print (verified: differ EN vs FR, usually null in FR).
-- Additive + nullable so a from-scratch apply and a re-seed both work.
alter table public.card_prints add column if not exists multiverse_ids int[];
alter table public.card_prints add column if not exists mtgo_id int;
alter table public.card_prints add column if not exists arena_id int;
alter table public.card_prints add column if not exists tcgplayer_id int;
alter table public.card_prints add column if not exists cardmarket_id int;

-- Lookup indexes for the external-id read paths (partial: skip nulls).
create index if not exists card_prints_mtgo_id_idx on public.card_prints (mtgo_id) where mtgo_id is not null;
create index if not exists card_prints_arena_id_idx on public.card_prints (arena_id) where arena_id is not null;
create index if not exists card_prints_tcgplayer_id_idx on public.card_prints (tcgplayer_id) where tcgplayer_id is not null;
create index if not exists card_prints_cardmarket_id_idx on public.card_prints (cardmarket_id) where cardmarket_id is not null;
create index if not exists card_prints_multiverse_ids_idx on public.card_prints using gin (multiverse_ids);
