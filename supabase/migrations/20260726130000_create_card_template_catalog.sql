-- =========================================================================
-- Catalogue des templates de cartes (Custom Card Studio).
--
-- Les assets eux-mêmes (frames MSE + CardConjurer, ~1580 fichiers / 217 Mo)
-- vivent dans le bucket Storage `card-templates`, PAS dans le dépôt : la PR
-- d'origine committait 35 030 fichiers pour 1 Go, dont 95 % jamais référencés.
-- Le dossier local qui sert de source d'upload est gitignoré.
--
-- Cette table est le manifeste : elle remplace le templates.json statique que
-- le client allait chercher dans /public. Le studio la lit via PostgREST, ce
-- qui permet de mettre à jour le catalogue sans redéployer, et de servir les
-- images depuis le CDN Storage.
--
-- Alimentation : scripts/card-assets/upload-templates.mjs (local puis prod,
-- même script, seul le .env change).
-- =========================================================================

create table if not exists public.card_templates (
  -- id fonctionnel issu du manifeste ("cardconjurer-m15-regular", nom du
  -- répertoire .mse-style sinon). Stable entre deux exécutions du script.
  id              text        primary key,

  name            text        not null,
  short_name      text,

  -- 'cardconjurer' (frames haute fidélité) ou 'mse' (Full Magic Pack).
  source          text        not null,
  -- 'accurate' | 'legacy' : pilote le tri dans le sélecteur de template.
  quality         text        not null default 'legacy',

  -- Famille de carte : oriente le layout par défaut et le filtrage UI.
  kind            text        not null,
  orientation     text        not null default 'unknown',
  layout_id       text,

  -- Chemins DANS le bucket card-templates (pas des URLs : le client les
  -- résout via getPublicUrl, ce qui garde l'origine Storage configurable).
  sample_path     text,
  icon_path       text,
  -- { light, tide, void, ember, grove, prismatic, artifact, land } -> chemin
  frame_paths     jsonb       not null default '{}'::jsonb,
  -- Couleurs de texte échantillonnées par frame, pour que le rendu reste
  -- lisible sur les frames sombres. Même forme de clés que frame_paths.
  frame_text_colors jsonb     not null default '{}'::jsonb,
  sample_text_colors jsonb,

  -- 'frame' : on compose la carte à partir des frames ; 'sample' : template
  -- dégradé qui n'a qu'une image d'exemple exploitable.
  render_mode     text        not null default 'sample',

  width           integer,
  height          integer,
  dpi             integer,

  -- Traçabilité : version du pack amont + horodatage de l'upload.
  asset_version   text,
  version         text,
  updated_at      timestamptz not null default now(),

  constraint card_templates_source_check
    check (source in ('cardconjurer', 'mse')),
  constraint card_templates_quality_check
    check (quality in ('accurate', 'legacy')),
  constraint card_templates_kind_check
    check (kind in (
      'card', 'token', 'planeswalker', 'saga', 'split',
      'double-faced', 'oversized', 'packaging'
    )),
  constraint card_templates_orientation_check
    check (orientation in ('portrait', 'landscape', 'unknown')),
  constraint card_templates_render_mode_check
    check (render_mode in ('frame', 'sample')),
  constraint card_templates_frame_paths_object
    check (jsonb_typeof(frame_paths) = 'object'),
  constraint card_templates_frame_text_colors_object
    check (jsonb_typeof(frame_text_colors) = 'object')
);

-- Le sélecteur liste d'abord les frames "accurate", puis le reste par nom.
create index if not exists card_templates_browse_idx
  on public.card_templates (quality, kind, name);

alter table public.card_templates enable row level security;

-- Catalogue purement public : aucune donnée utilisateur, lisible par tous.
-- L'écriture passe exclusivement par le script d'upload (service_role), donc
-- aucune policy insert/update/delete n'est accordée à anon/authenticated.
drop policy if exists "public read card templates" on public.card_templates;
create policy "public read card templates"
  on public.card_templates for select
  to anon, authenticated
  using (true);

-- Grants explicites : ne pas dépendre de la default ACL (cf. 20260724120002).
--
-- La default ACL de ce cluster accorde `all` sur toute nouvelle table à anon et
-- authenticated — TRUNCATE compris, qui CONTOURNE la RLS : n'importe quel
-- porteur de la clé anon pourrait vider le catalogue. On révoque donc tout puis
-- on ne re-grant que la lecture.
revoke all on public.card_templates from anon, authenticated;
grant select on public.card_templates to anon, authenticated;

-- Le script d'upload écrit avec la clé service-role. PostgREST l'utilise via le
-- rôle `service_role`, qui n'hérite d'aucun privilège de table par défaut ici.
grant select, insert, update, delete on public.card_templates to service_role;

-- -------------------------------------------------------------------------
-- Bucket des assets de template. Public : ce sont des frames vierges
-- partagées par tous les utilisateurs, servies par le CDN et fortement
-- cachées côté client (les chemins sont versionnés par asset_version).
-- Écriture réservée au service_role qui exécute le script d'upload.
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-templates',
  'card-templates',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read card-templates bucket" on storage.objects;
create policy "public read card-templates bucket"
  on storage.objects for select
  using (bucket_id = 'card-templates');

drop policy if exists "service role write card-templates bucket" on storage.objects;
create policy "service role write card-templates bucket"
  on storage.objects for all
  using (bucket_id = 'card-templates' and auth.role() = 'service_role')
  with check (bucket_id = 'card-templates' and auth.role() = 'service_role');
