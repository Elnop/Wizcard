-- Allow a deck to store a user-chosen cover art URL (Scryfall art_crop).
-- When null, the cover falls back to the auto-computed pickCoverArt() result.
alter table public.decks
  add column if not exists cover_art_url text;
