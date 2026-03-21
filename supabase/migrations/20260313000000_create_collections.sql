-- Migration: create collections table with RLS
-- Date: 2026-03-13

create table public.collections (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  card_id         text        not null,
  quantity        integer     not null default 1 check (quantity >= 1),
  date_added      timestamptz not null default now(),
  is_foil         boolean,
  foil_type       text        check (foil_type in ('foil', 'etched')),
  condition       text,
  language        text,
  purchase_price  text,
  tradelist_count integer,
  alter           boolean,
  proxy           boolean,
  tags            text[],
  primary key (user_id, card_id)
);

alter table public.collections enable row level security;

create policy "select own" on public.collections for select using (auth.uid() = user_id);
create policy "insert own" on public.collections for insert with check (auth.uid() = user_id);
create policy "update own" on public.collections for update using (auth.uid() = user_id);
create policy "delete own" on public.collections for delete using (auth.uid() = user_id);
