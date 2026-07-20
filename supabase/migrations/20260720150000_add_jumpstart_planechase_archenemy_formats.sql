-- Add jumpstart / planechase / archenemy to the allowed deck formats.
--
-- The MTGJSON precon import surfaced 590 decks whose type IS a real Magic
-- format but which had no entry in decks_format_check, so they were stored with
-- format NULL and rendered without a format badge:
--   Jumpstart   570
--   Planechase   12
--   Archenemy     8
--
-- The remaining ~1660 format-less precons stay NULL on purpose: Secret Lair
-- Drop, MTGO Redemption, Bundle Land Pack, Welcome Booster, promo bundles and
-- the like are products, not playable decks. Labelling those with a format
-- would be inventing information.
--
-- Widening a CHECK constraint is backward compatible: every value that was
-- legal before is still legal.
--
-- Idempotent + reversible: drop-if-exists then recreate under the same name.

alter table public.decks drop constraint if exists decks_format_check;

alter table public.decks
  add constraint decks_format_check
  check (format is null or format in (
    'standard', 'modern', 'pioneer', 'legacy', 'vintage',
    'commander', 'pauper', 'draft', 'limited', 'oathbreaker', 'brawl',
    'jumpstart', 'planechase', 'archenemy'
  ));
