-- supabase/migrations/20260727150000_add_blend_masks.sql
--
-- Fondus bicolores
-- (cf. docs/superpowers/specs/2026-07-27-frame-variants-design.md).
--
-- Séparés de `frame_paths` parce que ce ne sont PAS des cadres : ce sont des
-- masques quasi-binaires que MSE combine avec DEUX cadres colorés
-- (masked_blend(mask, dark, light)). Peint seul, un masque donne une carte
-- blanche — les ranger avec les cadres inviterait justement cette erreur.
--
-- Les nouvelles variantes de CADRE (terrains, incolore) n'ont besoin d'aucune
-- migration : `frame_paths` est un jsonb dont on change le contenu, pas la
-- forme.

alter table public.card_templates
  add column if not exists blend_masks jsonb;

comment on column public.card_templates.blend_masks is
  'Masques de fondu bicolore { multicolor, hybrid, artifact } ; NULL si le gabarit n''en fournit pas. Ce ne sont PAS des cadres : à composer avec deux cadres colorés, jamais à peindre seuls.';

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
