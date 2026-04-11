-- Create deck_folders table (hierarchical, self-referential via parent_id)
create table public.deck_folders (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  parent_id  uuid        references public.deck_folders(id) on delete cascade,
  name       text        not null,
  position   integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.deck_folders (owner_id);
create index on public.deck_folders (parent_id);

alter table public.deck_folders enable row level security;

create policy "Users can view their own folders"
  on public.deck_folders for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own folders"
  on public.deck_folders for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own folders"
  on public.deck_folders for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own folders"
  on public.deck_folders for delete
  using (auth.uid() = owner_id);

-- Add folder_id to decks
-- ON DELETE SET NULL: deleting a folder moves its decks to "Sans dossier" (folderId = null)
alter table public.decks
  add column folder_id uuid references public.deck_folders(id) on delete set null;

create index on public.decks (folder_id) where folder_id is not null;
