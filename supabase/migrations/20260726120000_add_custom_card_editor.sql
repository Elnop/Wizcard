-- =========================================================================
-- Custom Card Studio : données source éditables pour les cartes créées par
-- l'utilisateur. Le rendu final reste dans image_storage_path afin que toutes
-- les surfaces d'affichage existantes continuent de fonctionner sans changement.
--
-- Réécriture de la migration issue de la PR #2 (fork), rebasée sur l'état réel
-- de main :
--   * timestamp déplacé (collision avec 20260719120000_add_profile_ignored_tags)
--   * idempotence complète (add constraint / create policy ne l'étaient pas)
--   * policy storage alignée sur la gate profile_is_public (20260713130000),
--     que la version d'origine ignorait
--   * quota de 500 cartes créées par utilisateur (le studio transforme un flux
--     d'ingestion en création directe, non couverte par trg_cards_limit)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Colonnes de la source éditable.
-- -------------------------------------------------------------------------
alter table public.custom_cards
  add column if not exists layout text not null default 'arcana',
  add column if not exists editor_payload jsonb,
  add column if not exists art_storage_path text,
  add column if not exists back_image_storage_path text,
  add column if not exists updated_at timestamptz not null default now();

-- `add constraint` n'accepte pas `if not exists` : on drop d'abord pour que la
-- migration reste rejouable (le reste du fichier l'est).
alter table public.custom_cards
  drop constraint if exists custom_cards_layout_check;

alter table public.custom_cards
  add constraint custom_cards_layout_check
    check (layout in (
      'arcana', 'modern', 'full-art', 'showcase', 'token',
      'planeswalker', 'saga', 'adventure', 'landscape'
    ));

alter table public.custom_cards
  drop constraint if exists custom_cards_editor_payload_object;

alter table public.custom_cards
  add constraint custom_cards_editor_payload_object
    check (editor_payload is null or jsonb_typeof(editor_payload) = 'object');

-- Liste « mes cartes créées », triée par édition la plus récente.
create index if not exists custom_cards_creator_updated_idx
  on public.custom_cards (created_by, updated_at desc)
  where source_type = 'user_created';

-- -------------------------------------------------------------------------
-- 2. updated_at maintenu par la DB.
--    La colonne n'a qu'un `default now()` : sans trigger elle resterait figée
--    à la création et l'index ci-dessus trierait sur une valeur morte. Le
--    client n'a pas besoin (ni le droit) de la poser lui-même.
-- -------------------------------------------------------------------------
create or replace function public.trg_custom_cards_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists custom_cards_touch_before on public.custom_cards;
create trigger custom_cards_touch_before
  before update on public.custom_cards
  for each row execute function public.trg_custom_cards_touch();

-- -------------------------------------------------------------------------
-- 3. Quota : 500 cartes créées par utilisateur.
--
--    trg_cards_limit ne couvre que card_entries (collection / deck). Le studio
--    écrit directement dans custom_cards depuis le client, avec un upload
--    Storage à la clé : sans plafond, rien ne borne le volume.
--
--    On ne dénormalise PAS le compteur dans user_usage : contrairement à la
--    collection (250k), 500 est assez bas pour qu'un count(*) direct reste
--    trivial, et l'index partiel ci-dessous le rend O(log n). Cela évite un
--    compteur supplémentaire à maintenir et à backfiller.
-- -------------------------------------------------------------------------
create index if not exists custom_cards_created_by_user_created_idx
  on public.custom_cards (created_by)
  where source_type = 'user_created';

create or replace function public.trg_custom_cards_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare created_count integer;
begin
  -- Seules les cartes créées par l'utilisateur sont plafonnées : les cartes
  -- ingérées (mpc_ingested) arrivent par le pipeline service_role et n'ont pas
  -- vocation à consommer le quota de qui que ce soit.
  if new.source_type <> 'user_created' or new.created_by is null then
    return new;
  end if;

  select count(*) into created_count
    from public.custom_cards
    where created_by = new.created_by
      and source_type = 'user_created';

  if created_count >= 500 then
    raise exception 'WIZCARD_LIMIT_CUSTOM_CARDS: limite de 500 cartes créées atteinte';
  end if;

  return new;
end;
$$;

drop trigger if exists custom_cards_limit_before on public.custom_cards;
create trigger custom_cards_limit_before
  before insert on public.custom_cards
  for each row execute function public.trg_custom_cards_limit();

-- -------------------------------------------------------------------------
-- 4. Storage : bornes serveur sur le bucket de rendus.
--    La validation navigateur reste de l'UX ; ceci ferme la porte aux appels
--    directs à l'API Storage.
-- -------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'custom-cards';

-- L'artwork source n'a jamais besoin d'URL publique. Un bucket privé dédié
-- évite d'exposer l'upload original de l'utilisateur à côté du rendu public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-card-art',
  'custom-card-art',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user upload own custom-card-art" on storage.objects;
create policy "user upload own custom-card-art"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-card-art'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "user manage own custom-card-art" on storage.objects;
create policy "user manage own custom-card-art"
  on storage.objects for all
  using (
    bucket_id = 'custom-card-art'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'custom-card-art'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -------------------------------------------------------------------------
-- 5. Lecture publique du bucket de rendus : les DEUX faces.
--
--    Repart de la version en vigueur (20260604000002) — pas de celle de la
--    création du bucket — et ajoute :
--      a) back_image_storage_path, pour que la face arrière d'une DFC custom
--         soit lisible au même titre que la face avant ;
--      b) la gate profile_is_public introduite par 20260713130000. Sans elle,
--         une carte publique appartenant à un profil PRIVÉ resterait lisible,
--         ce qui contredit le toggle « Profil public » des réglages.
--    Le propriétaire garde l'accès complet à ses propres fichiers.
--
--    CORRECTIF au passage : la version 20260604000002 écrivait la sous-requête
--    avec un `name` non qualifié. Comme public.custom_cards possède elle-même
--    une colonne `name` (le nom de la carte), la référence se résolvait sur la
--    table INTERNE et non sur storage.objects.name : la comparaison opposait un
--    nom de carte à un chemin de fichier et n'était donc jamais vraie. La
--    branche publique de la policy était morte — seul le propriétaire voyait
--    ses fichiers. On qualifie explicitement `storage.objects.name` (et on
--    alise la table interne) pour que la lecture publique fonctionne enfin.
-- -------------------------------------------------------------------------
drop policy if exists "public read custom-cards bucket" on storage.objects;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (
    bucket_id = 'custom-cards'
    and (
      exists (
        select 1 from public.custom_cards cc
        where (
            cc.image_storage_path = storage.objects.name
            or cc.back_image_storage_path = storage.objects.name
          )
          and cc.is_public = true
          and cc.created_by is not null
          and public.profile_is_public(cc.created_by)
      )
      or (storage.foldername(storage.objects.name))[1] = auth.uid()::text
    )
  );

-- -------------------------------------------------------------------------
-- 6. Grants.
--    custom_cards a déjà `grant select` (20260724120002) et ses privilèges
--    d'écriture au niveau table — les nouvelles colonnes en héritent donc
--    automatiquement. On (re)pose l'INSERT/UPDATE explicitement pour rester
--    cohérent avec la politique « le schéma ne dépend pas de la default ACL »
--    de 20260724120002. Pas de grant colonne par colonne ici : custom_cards
--    n'a pas de colonne sensible du type purchase_price, et updated_at est
--    reposé par le trigger BEFORE quoi qu'écrive le client.
-- -------------------------------------------------------------------------
grant select                 on public.custom_cards to anon, authenticated;
grant insert, update, delete on public.custom_cards to authenticated;
