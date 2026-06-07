alter table public.custom_cards
  add column if not exists drive_folder_path text;
