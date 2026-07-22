-- Cache partagé des images/textes localisés (non-anglais), pré-rempli par le seed
-- bulk (scripts/seed/seed-localized-cards.ts). Supprime le N+1 sur api.scryfall.com
-- en 1re visite : le client lit ici par (set, collector_number, lang) au lieu de
-- fetcher /cards/{set}/{number}/{lang} carte par carte.
--
-- PK = (set, collector_number, lang) : la seule clé que le client possède au moment
-- de lire (il ne connaît pas l'UUID du print localisé, c'est ce qu'il vient chercher).
-- scryfall_id (print localisé) et oracle_id (identité gameplay) sont des colonnes de
-- liaison/traçabilité, pas la clé d'accès.
--
-- card_faces : TOUJOURS un tableau de 1 ou 2 entrées (Option 1 — jamais NULL, jamais
-- de colonne racine image_uris/printed_* séparée). Mono-face = 1 entrée ; carte à deux
-- images physiques (transform, modal_dfc) = 2 entrées. Chaque entrée porte
-- { image_uris, printed_name, printed_type_line, printed_text } (noms Scryfall).
create table if not exists public.localized_cards (
  set text not null,
  collector_number text not null,
  lang text not null,
  scryfall_id uuid not null,
  oracle_id uuid,
  card_faces jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (set, collector_number, lang)
);

create unique index if not exists localized_cards_scryfall_id_key
  on public.localized_cards (scryfall_id);

create index if not exists localized_cards_oracle_id_idx
  on public.localized_cards (oracle_id);

-- lang est toujours non-anglais dans cette table (l'anglais ne déclenche jamais de
-- localisation côté client).
alter table public.localized_cards
  drop constraint if exists localized_cards_lang_not_en;
alter table public.localized_cards
  add constraint localized_cards_lang_not_en check (lang <> 'en');

-- Lecture publique : un deck public doit être consultable sans login ; ce sont des
-- URLs d'images publiques, pas de données privées. AUCUNE policy d'écriture — la
-- table n'est écrite que par le seed via la service-role key (bypasse la RLS).
alter table public.localized_cards enable row level security;

drop policy if exists localized_cards_select_all on public.localized_cards;
create policy localized_cards_select_all
  on public.localized_cards
  for select
  using (true);

grant select on public.localized_cards to anon, authenticated;
