create table public.custom_cards (
  id                   text        primary key,
  source_id            text        not null references public.custom_card_sources(id) on delete cascade,
  name                 text        not null,
  raw_name             text        not null,
  image_storage_path   text,
  image_drive_url      text        not null,
  artist               text,
  tags                 text[]      not null default '{}',
  is_public            bool        not null default true,
  created_by           uuid        references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index custom_cards_source_id_idx on public.custom_cards(source_id);
create index custom_cards_name_idx on public.custom_cards(name);

alter table public.custom_cards enable row level security;

create policy "public read custom_cards"
  on public.custom_cards for select
  using (is_public = true);

create policy "service role write custom_cards"
  on public.custom_cards for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
