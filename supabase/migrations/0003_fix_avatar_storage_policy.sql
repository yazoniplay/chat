-- Tuffchat avatar policy refresh.
-- Match the first storage path segment to the authenticated JWT subject.
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);