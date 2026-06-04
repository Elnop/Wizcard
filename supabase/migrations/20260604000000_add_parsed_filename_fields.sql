ALTER TABLE custom_cards
  ADD COLUMN IF NOT EXISTS set_code         text,
  ADD COLUMN IF NOT EXISTS collector_number text,
  ADD COLUMN IF NOT EXISTS variants         text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS custom_cards_set_code_idx
  ON custom_cards (set_code)
  WHERE set_code IS NOT NULL;
