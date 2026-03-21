-- Add CHECK constraints for foil_type and condition columns
ALTER TABLE public.collections
  ADD CONSTRAINT collections_foil_type_check
    CHECK (foil_type IS NULL OR foil_type IN ('foil', 'etched')),
  ADD CONSTRAINT collections_condition_check
    CHECK (condition IS NULL OR condition IN ('NM', 'LP', 'MP', 'HP', 'DMG'));

-- Covering index for fetchCollection to avoid heap fetches
CREATE INDEX ON public.collections (user_id) INCLUDE (card_id, row_id, date_added);
