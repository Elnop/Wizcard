-- Replace tradelist_count (integer) with for_trade (boolean) per-copy
ALTER TABLE public.cards ADD COLUMN for_trade boolean DEFAULT false;
UPDATE public.cards SET for_trade = (tradelist_count > 0) WHERE tradelist_count IS NOT NULL;
ALTER TABLE public.cards DROP COLUMN tradelist_count;
