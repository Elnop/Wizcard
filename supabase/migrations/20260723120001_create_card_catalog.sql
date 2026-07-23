-- Scryfall card catalog mirror. Public read data (like localized_cards); written
-- only by the seed via the service-role key. Modeled on Scryfall's identity levels:
-- card_definitions (oracle/gameplay) -> card_prints (edition x language) -> card_faces;
-- card_parts holds oracle->oracle relations (tokens/meld/combo).

create table if not exists public.card_definitions (
  oracle_id      uuid primary key,
  name           text not null,
  type_line      text,
  oracle_text    text,
  mana_cost      text,
  cmc            numeric,
  colors         text[],
  color_identity text[],
  keywords       text[],
  power          text,
  toughness      text,
  loyalty        text,
  defense        text,
  legalities     jsonb,
  reserved       boolean,
  edhrec_rank    int,
  layout         text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.card_prints (
  id                uuid primary key,
  oracle_id         uuid not null references public.card_definitions(oracle_id) on delete cascade,
  set               text not null,
  collector_number  text not null,
  lang              text not null,
  rarity            text,
  released_at       date,
  artist            text,
  border_color      text,
  frame             text,
  image_status      text,
  image_uris        jsonb,
  finishes          text[],
  promo             boolean,
  reprint           boolean,
  variation         boolean,
  digital           boolean,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  updated_at        timestamptz not null default now()
);

alter table public.card_prints
  drop constraint if exists card_prints_lang_check;
alter table public.card_prints
  add constraint card_prints_lang_check check (lang in ('en', 'fr'));

create unique index if not exists card_prints_set_number_lang_key
  on public.card_prints (set, collector_number, lang);
create index if not exists card_prints_oracle_id_idx
  on public.card_prints (oracle_id);

create table if not exists public.card_faces (
  print_id          uuid not null references public.card_prints(id) on delete cascade,
  face_index        smallint not null,
  name              text,
  type_line         text,
  oracle_text       text,
  mana_cost         text,
  colors            text[],
  power             text,
  toughness         text,
  loyalty           text,
  artist            text,
  illustration_id   uuid,
  image_uris        jsonb,
  printed_name      text,
  printed_type_line text,
  printed_text      text,
  primary key (print_id, face_index)
);

create table if not exists public.card_parts (
  oracle_id          uuid not null references public.card_definitions(oracle_id) on delete cascade,
  related_oracle_id  uuid not null,   -- NO strict FK: may cite an un-seeded oracle
  component          text not null,
  name               text,
  type_line          text,
  primary key (oracle_id, related_oracle_id, component)
);

-- RLS: public read; no write policies (service_role bypasses RLS but still needs grants).
alter table public.card_definitions enable row level security;
alter table public.card_prints      enable row level security;
alter table public.card_faces       enable row level security;
alter table public.card_parts       enable row level security;

drop policy if exists card_definitions_select_all on public.card_definitions;
create policy card_definitions_select_all on public.card_definitions for select using (true);
drop policy if exists card_prints_select_all on public.card_prints;
create policy card_prints_select_all on public.card_prints for select using (true);
drop policy if exists card_faces_select_all on public.card_faces;
create policy card_faces_select_all on public.card_faces for select using (true);
drop policy if exists card_parts_select_all on public.card_parts;
create policy card_parts_select_all on public.card_parts for select using (true);

grant select on public.card_definitions, public.card_prints, public.card_faces, public.card_parts
  to anon, authenticated;
grant select, insert, update, delete
  on public.card_definitions, public.card_prints, public.card_faces, public.card_parts
  to service_role;
