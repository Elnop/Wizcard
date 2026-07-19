-- Ignored tags: custom prints carrying any of these tags are hidden across
-- print lists / card page / picker, and fall back to an official print at
-- display time. Default '{nsfw}' so new profiles hide NSFW out of the box.
alter table public.profiles
  add column if not exists ignored_tags text[] not null default '{nsfw}'::text[];
