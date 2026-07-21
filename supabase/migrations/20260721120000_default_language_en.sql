-- New accounts default to English, matching the app's default locale.
-- Existing profiles keep their stored preference (no backfill).
alter table public.profiles
  alter column language set default 'en';
