-- Create decks table
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

-- Add deck_id and zone columns to cards table
alter table public.cards add column deck_id uuid references public.decks(id) on delete cascade;
alter table public.cards add column zone text check (zone is null or zone in ('mainboard', 'sideboard', 'maybeboard', 'commander'));

-- Make owner_id nullable (deck-only cards have no owner_id)
alter table public.cards alter column owner_id drop not null;

-- At least one of owner_id or deck_id must be set
alter table public.cards add constraint cards_owner_or_deck
  check (owner_id is not null or deck_id is not null);

-- Index for deck card queries
create index on public.cards (deck_id) where deck_id is not null;

-- Update RLS policies to support deck-only cards (owner_id null, deck_id set)
drop policy "Users can view their own cards" on public.cards;
create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can insert their own cards" on public.cards;
create policy "Users can insert their own cards"
  on public.cards for insert
  with check (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can update their own cards" on public.cards;
create policy "Users can update their own cards"
  on public.cards for update
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );

drop policy "Users can delete their own cards" on public.cards;
create policy "Users can delete their own cards"
  on public.cards for delete
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where owner_id = auth.uid())
  );
