-- supabase/migrations/20260727130000_add_frame_facets.sql
--
-- Navigation de la bibliothèque de cadres
-- (cf. docs/superpowers/specs/2026-07-27-frame-picker-navigation-design.md).
--
-- Le corpus MSE déclare sa propre taxonomie — `installer group` et
-- `position hint` sont présents sur les 109 gabarits proposés. On l'expose au
-- lieu de la réinterpréter.

alter table public.card_templates
  add column if not exists installer_group text,
  add column if not exists position_hint text,
  add column if not exists tags text[] not null default '{}';

comment on column public.card_templates.installer_group is
  'Chemin `installer group` BRUT du style MSE (magic/m15 style/split cards). Non découpé : la famille en est une projection, tout reste re-dérivable.';
comment on column public.card_templates.position_hint is
  'Champ `position hint` déclaré (001-907). Ordre de tri du sélecteur.';
comment on column public.card_templates.tags is
  'Tous les mots-clés du gabarit, union de l''id, du nom et du chemin déclaré. Remplace `kind`.';

-- `kind` était une cascade de regex sur id+name, pas de la donnée : elle
-- produisait des faux positifs (« Taller Textbox » -> packaging, « Planar
-- Chaos » -> oversized, un gabarit chacune) et rangeait les flip cards avec les
-- double-faces, deux mécaniques distinctes. Elle n'est lue que par le studio et
-- ne pilote aucun rendu (la géométrie vient de `geometry`).
alter table public.card_templates
  drop column if exists kind;

-- `card_templates_browse_idx` (quality, kind, name), créé par 20260726130000,
-- a été supprimé en cascade par le `drop column kind` ci-dessus. On le
-- recrée sans `kind` : la colonne qui portait l'index a disparu, pas le besoin
-- de parcourir par qualité puis par nom.
create index if not exists card_templates_browse_idx
  on public.card_templates (quality, name);

-- Le filtre par mot-clé interroge un tableau : index GIN.
create index if not exists card_templates_tags_idx
  on public.card_templates using gin (tags);

-- Tri par défaut du sélecteur.
create index if not exists card_templates_position_hint_idx
  on public.card_templates (position_hint);

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
