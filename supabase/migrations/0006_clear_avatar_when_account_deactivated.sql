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
  set deletion_requested_at = now(),
      avatar_url = null
  where id = (select auth.uid())
  returning deletion_requested_at into requested_at;
  if requested_at is null then
    raise exception 'Profile not found';
  end if;
  return requested_at;
end;
$$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;