-- Bootstrap migration: creates the final schema from scratch.
-- Use this to initialize a fresh database without replaying all previous migrations.
-- NOT intended to run on an existing database that already has the cards table.

create table public.cards (
  id             uuid        primary key default gen_random_uuid(),
  owner_id       uuid        not null references auth.users(id) on delete cascade,
  scryfall_id    text        not null,
  date_added     timestamptz not null default now(),
  is_foil        boolean,
  foil_type      text        check (foil_type is null or foil_type in ('foil', 'etched')),
  condition      text        check (condition is null or condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  language       text,
  purchase_price text,
  for_trade      boolean     default false,
  alter          boolean,
  proxy          boolean,
  tags           text[]
);

-- Index for fetchCollection queries (covers common columns to avoid heap fetches)
create index on public.cards (owner_id, scryfall_id);
create index on public.cards (owner_id) include (scryfall_id, id, date_added);

alter table public.cards enable row level security;

create policy "Users can view their own cards"
  on public.cards for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own cards"
  on public.cards for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own cards"
  on public.cards for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own cards"
  on public.cards for delete
  using (auth.uid() = owner_id);
