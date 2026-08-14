-- supabase/migrations/20260727140000_add_crown_paths.sql
--
-- Couronne légendaire
-- (cf. docs/superpowers/specs/2026-07-27-legendary-crown-design.md).
--
-- Le légendaire n'est pas un cadre : c'est une couronne posée SUR le cadre
-- normal, comme sur une vraie carte. Les couronnes du corpus sont dessinées pour
-- la barre de titre M15, donc tous les gabarits ne peuvent pas les porter.

alter table public.card_templates
  add column if not exists crown_paths jsonb;

comment on column public.card_templates.crown_paths is
  'Chemins des couronnes légendaires par clé de couleur, ou NULL si le gabarit n''accepte pas la couronne (boîte de nom incompatible avec la référence M15). Pas de clé `land` : le corpus ne fournit pas de couronne terrain.';

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
