-- Editable source data for user-created cards. The rendered front remains in
-- image_storage_path so every existing card surface can display it unchanged.
alter table public.custom_cards
  add column if not exists layout text not null default 'arcana',
  add column if not exists editor_payload jsonb,
  add column if not exists art_storage_path text,
  add column if not exists back_image_storage_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.custom_cards
  add constraint custom_cards_layout_check
    check (layout in (
      'arcana', 'modern', 'full-art', 'showcase', 'token',
      'planeswalker', 'saga', 'adventure', 'landscape'
    )),
  add constraint custom_cards_editor_payload_object
    check (editor_payload is null or jsonb_typeof(editor_payload) = 'object');

create index if not exists custom_cards_creator_updated_idx
  on public.custom_cards (created_by, updated_at desc)
  where source_type = 'user_created';

-- Keep browser-side validation as UX, and enforce the same safety boundary for
-- direct Storage API callers.
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'custom-cards';

-- Source artwork never needs a public URL. Keeping it in a dedicated private
-- bucket avoids exposing the user's original upload with the public render.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-card-art',
  'custom-card-art',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "user upload own custom-card-art"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-card-art'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "user manage own custom-card-art"
  on storage.objects for all
  using (
    bucket_id = 'custom-card-art'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'custom-card-art'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A public card may expose both rendered faces. Source artwork stays owner-only.
drop policy if exists "public read custom-cards bucket" on storage.objects;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (
    bucket_id = 'custom-cards'
    and (
      exists (
        select 1 from public.custom_cards
        where (image_storage_path = name or back_image_storage_path = name)
          and is_public = true
      )
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
