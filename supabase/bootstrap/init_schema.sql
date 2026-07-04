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
  cover_art_url text,
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
  wishlist       boolean     not null default false,
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

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  description text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public can view profiles"
  on public.profiles for select
  to anon, authenticated using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Unique, auto-generated default nickname (wizard_<hex> from the user id).
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname))
  where nickname is not null;

create function public.default_nickname_base(uid uuid)
  returns text
  language sql
  immutable
as $$
  select 'wizard_' || substr(md5(uid::text), 1, 6);
$$;

create function public.generate_unique_nickname(uid uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text;
  hexlen int := 6;
begin
  loop
    candidate := 'wizard_' || substr(md5(uid::text), 1, hexlen);
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    hexlen := hexlen + 1;
    if hexlen > 32 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
    values (new.id, public.generate_unique_nickname(new.id))
    on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users
insert into public.profiles (id, nickname)
  select id, public.generate_unique_nickname(id) from auth.users
  on conflict (id) do nothing;

-- Avatars storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "public read avatars bucket"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write own avatar"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
