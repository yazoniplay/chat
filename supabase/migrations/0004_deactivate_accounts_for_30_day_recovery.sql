alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare requested_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;
  update public.profiles
  set deletion_requested_at = now()
  where id = (select auth.uid())
  returning deletion_requested_at into requested_at;
  if requested_at is null then
    raise exception 'Profile not found';
  end if;
  return requested_at;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;
  update public.profiles
  set deletion_requested_at = null
  where id = (select auth.uid());
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function private.is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = target_conversation
      and cm.user_id = (select auth.uid())
      and p.deletion_requested_at is null
  );
$$;

revoke all on function private.is_conversation_member(uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid) to authenticated;

create extension if not exists pg_cron;

create or replace function private.purge_deactivated_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  deleted_count integer := 0;
begin
  for target_user in
    select id
    from public.profiles
    where deletion_requested_at <= now() - interval '30 days'
  loop
    delete from storage.objects where owner_id = target_user::text;
    delete from auth.users where id = target_user;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end;
$$;

revoke all on function private.purge_deactivated_accounts() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'tuffchat-purge-deactivated-accounts') then
    perform cron.schedule(
      'tuffchat-purge-deactivated-accounts',
      '15 3 * * *',
      'select private.purge_deactivated_accounts();'
    );
  end if;
end;
$$;