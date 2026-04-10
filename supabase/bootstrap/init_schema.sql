-- Bootstrap migration: creates the final schema from scratch.
-- Use this to initialize a fresh database without replaying all previous migrations.
-- NOT intended to run on an existing database that already has the cards/decks tables.

-- Decks table
create table public.decks (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  format      text        check (format is null or format in (
    'standard', 'modern', 'pioneer', 'legacy', 'vintage',
    'commander', 'pauper', 'draft', 'limited', 'oathbreaker', 'brawl'
  )),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on public.decks (owner_id);

alter table public.decks enable row level security;

create policy "Users can view their own decks"
  on public.decks for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own decks"
  on public.decks for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own decks"
  on public.decks for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own decks"
  on public.decks for delete
  using (auth.uid() = owner_id);

-- Cards table (collection cards + deck cards unified)
create table public.cards (
  id             uuid        primary key default gen_random_uuid(),
  owner_id       uuid        references auth.users(id) on delete cascade,
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
  tags           text[],
  deck_id        uuid        references public.decks(id) on delete cascade,
  constraint cards_owner_or_deck check (owner_id is not null or deck_id is not null)
);

-- Index for fetchCollection queries (covers common columns to avoid heap fetches)
create index on public.cards (owner_id, scryfall_id);
create index on public.cards (owner_id) include (scryfall_id, id, date_added);
create index on public.cards (deck_id) where deck_id is not null;

alter table public.cards enable row level security;

create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can insert their own cards"
  on public.cards for insert
  with check (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can update their own cards"
  on public.cards for update
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

create policy "Users can delete their own cards"
  on public.cards for delete
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );
