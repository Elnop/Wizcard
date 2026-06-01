create table public.custom_card_sources (
  id              text        primary key,
  name            text        not null,
  description     text,
  provider        text        not null default 'mpcfill',
  external_link   text,
  drive_folder_id text,
  tags            text[]      not null default '{}',
  card_count      int         not null default 0,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.custom_card_sources enable row level security;

create policy "public read custom_card_sources"
  on public.custom_card_sources for select
  using (true);

create policy "service role write custom_card_sources"
  on public.custom_card_sources for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
