-- Drop old table (1 row = 1 card with quantity column)
drop table if exists public.collections cascade;

-- New table: 1 row = 1 physical copy, PK = row_id
create table public.collections (
  row_id       uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  card_id      text        not null,
  date_added   timestamptz not null default now(),
  is_foil      boolean,
  foil_type    text,
  condition    text,
  language     text,
  purchase_price text,
  tradelist_count integer,
  alter        boolean,
  proxy        boolean,
  tags         text[]
);

create index on public.collections (user_id, card_id);

-- RLS
alter table public.collections enable row level security;

create policy "Users can view their own collection"
  on public.collections for select
  using (auth.uid() = user_id);

create policy "Users can insert into their own collection"
  on public.collections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own collection"
  on public.collections for update
  using (auth.uid() = user_id);

create policy "Users can delete from their own collection"
  on public.collections for delete
  using (auth.uid() = user_id);
