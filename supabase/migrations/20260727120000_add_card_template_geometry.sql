-- Géométrie mesurée du gabarit, extraite du corpus MSE (cf.
-- docs/superpowers/specs/2026-07-26-mse-geometry-extraction-design.md).
--
-- Forme : { cardWidth, cardHeight, boxes: { image|name|type|text|pt|"casting cost":
-- { left, top, width, height } }, ast: { … } }
--
-- NULL signifie « non mesuré » : le studio n'affiche PAS ces gabarits, plutôt
-- que de leur prêter la géométrie d'un autre. L'AST est conservé pour permettre
-- une évaluation dynamique ultérieure sans réextraction.
alter table public.card_templates
  add column if not exists geometry jsonb;

comment on column public.card_templates.geometry is
  'Géométrie mesurée depuis le style MSE ; NULL = non mesuré, gabarit non proposé.';
