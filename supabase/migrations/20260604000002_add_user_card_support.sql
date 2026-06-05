-- source_type distinguishes ingested MPC cards from user-created cards
alter table public.custom_cards
  add column if not exists source_type text not null default 'mpc_ingested'
    check (source_type in ('mpc_ingested', 'user_created'));

-- user_created cards have no external source
alter table public.custom_cards
  alter column source_id drop not null;

-- user_created cards store image in Supabase Storage, not Drive
alter table public.custom_cards
  alter column image_drive_url drop not null;

-- drop the cascade FK so source_id can be null for user_created cards
alter table public.custom_cards
  drop constraint if exists custom_cards_source_id_fkey;

alter table public.custom_cards
  add constraint custom_cards_source_id_fkey
    foreign key (source_id) references public.custom_card_sources(id) on delete set null;

-- extend public read to also allow users to read their own private cards
drop policy if exists "public read custom_cards" on public.custom_cards;

create policy "read custom_cards"
  on public.custom_cards for select
  using (is_public = true or created_by = auth.uid());

-- users can insert their own cards
create policy "user insert own custom_cards"
  on public.custom_cards for insert
  with check (created_by = auth.uid() and source_type = 'user_created');

-- users can update their own cards (rename, toggle public, etc.)
create policy "user update own custom_cards"
  on public.custom_cards for update
  using (created_by = auth.uid() and source_type = 'user_created');

-- users can delete their own cards
create policy "user delete own custom_cards"
  on public.custom_cards for delete
  using (created_by = auth.uid() and source_type = 'user_created');

-- Storage: users can upload images to their own folder (custom-cards/{user_uuid}/...)
create policy "user upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-cards'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage: users can update/delete their own files
create policy "user manage own storage objects"
  on storage.objects for all
  using (
    bucket_id = 'custom-cards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage: public read for files linked to public cards (replaces the simple policy from bucket creation)
drop policy if exists "public read custom-cards bucket" on storage.objects;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (
    bucket_id = 'custom-cards'
    and (
      exists (
        select 1 from public.custom_cards
        where image_storage_path = name and is_public = true
      )
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
