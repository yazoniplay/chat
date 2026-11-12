drop policy if exists "Signed-in users can find profiles" on public.profiles;
create policy "Signed-in users can find profiles" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or deletion_requested_at is null);

drop policy if exists "Active accounts can update profiles" on public.profiles;
create policy "Active accounts can update profiles" on public.profiles
as restrictive for update to authenticated
using (id = (select auth.uid()) and deletion_requested_at is null)
with check (id = (select auth.uid()) and deletion_requested_at is null);

drop policy if exists "Active accounts only" on public.conversations;
create policy "Active accounts only" on public.conversations
as restrictive for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null));

drop policy if exists "Active accounts only" on public.conversation_members;
create policy "Active accounts only" on public.conversation_members
as restrictive for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null));

drop policy if exists "Active accounts only" on public.messages;
create policy "Active accounts only" on public.messages
as restrictive for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.deletion_requested_at is null));

select cron.unschedule(jobid) from cron.job where jobname = 'tuffchat-purge-deactivated-accounts';
select cron.schedule('tuffchat-purge-deactivated-accounts','0 * * * *','select private.purge_deactivated_accounts();');