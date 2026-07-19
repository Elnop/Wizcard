-- Make (source, source_deck_id) usable as an ON CONFLICT arbiter.
--
-- 20260720120000 created this unique index WITH a partial predicate
-- (`where source_deck_id is not null`). Postgres refuses to use a partial
-- index as an ON CONFLICT arbiter unless the statement repeats the exact
-- predicate, and PostgREST's `onConflict=source,source_deck_id` cannot express
-- one — so the precon sync failed with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- The predicate was never needed. NULLs are distinct in a Postgres unique
-- index, so user decks (source='user', source_deck_id NULL) never collide with
-- each other; a plain unique index has identical semantics here AND is a valid
-- arbiter. Swap the partial index for a full one.
--
-- Idempotent + reversible: drop-if-exists then create-if-not-exists.

drop index if exists public.decks_source_deck_key;

create unique index if not exists decks_source_deck_key
  on public.decks (source, source_deck_id);
