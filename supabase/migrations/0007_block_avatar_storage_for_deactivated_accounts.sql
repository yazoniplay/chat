drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null)
);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null)
);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null)
);