insert into storage.buckets (id, name, public)
values ('custom-cards', 'custom-cards', true)
on conflict (id) do nothing;

create policy "public read custom-cards bucket"
  on storage.objects for select
  using (bucket_id = 'custom-cards');

create policy "service role write custom-cards bucket"
  on storage.objects for all
  using (bucket_id = 'custom-cards' and auth.role() = 'service_role')
  with check (bucket_id = 'custom-cards' and auth.role() = 'service_role');
