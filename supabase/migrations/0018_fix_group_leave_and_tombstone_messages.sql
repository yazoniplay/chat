drop function if exists public.leave_group_conversation(uuid);
create function public.leave_group_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  removed_count integer := 0;
  remaining_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to leave a group.';
  end if;
  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = current_user_id
    and exists (select 1 from public.conversations where id = p_conversation_id and is_group = true);
  get diagnostics removed_count = row_count;
  if removed_count = 0 then
    raise exception 'You are not a member of this group, or the group no longer exists.';
  end if;
  select count(*) into remaining_count from public.conversation_members where conversation_id = p_conversation_id;
  if remaining_count = 0 then
    delete from public.conversations where id = p_conversation_id and is_group = true;
  end if;
  return true;
end;
$$;
revoke all on function public.leave_group_conversation(uuid) from public, anon;
grant execute on function public.leave_group_conversation(uuid) to authenticated;
notify pgrst, 'reload schema';