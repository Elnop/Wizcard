-- Rename user_id to owner_id for semantic clarity
ALTER TABLE public.cards RENAME COLUMN user_id TO owner_id;
