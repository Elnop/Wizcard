-- Remove the zone column from cards — zone is now managed via tags (e.g. 'deck:mainboard')
alter table public.cards drop column zone;
