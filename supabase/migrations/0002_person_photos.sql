-- Profile photos for persons.
-- Apply with: supabase db push  (or paste into the SQL editor)

alter table public.persons add column photo_url text;

insert into storage.buckets (id, name, public)
values ('person-photos', 'person-photos', true)
on conflict (id) do nothing;

-- Photos are publicly viewable (tree pages are share-link based and already
-- expose names/dates the same way); only signed-in users can upload.
create policy person_photos_public_read on storage.objects
  for select using (bucket_id = 'person-photos');

create policy person_photos_authenticated_insert on storage.objects
  for insert with check (bucket_id = 'person-photos' and auth.uid() is not null);

create policy person_photos_authenticated_update on storage.objects
  for update using (bucket_id = 'person-photos' and auth.uid() is not null)
  with check (bucket_id = 'person-photos' and auth.uid() is not null);

create policy person_photos_authenticated_delete on storage.objects
  for delete using (bucket_id = 'person-photos' and auth.uid() is not null);
