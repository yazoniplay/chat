-- Group lifecycle actions and reliable message-delete change payloads.
alter table public.messages replica identity full;

create or replace function private.leave_group_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'You must be signed in to leave a group.';
  end if;
  if not exists (
    select 1 from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id and c.is_group = true and cm.user_id = current_user_id
  ) then
    raise exception 'You are not a member of this group.';
  end if;
  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = current_user_id;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id) then
    delete from public.conversations where id = p_conversation_id and is_group = true;
  end if;
end;
$$;

create or replace function private.delete_group_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'You must be signed in to delete a group.';
  end if;
  delete from public.conversations
  where id = p_conversation_id and is_group = true and created_by = current_user_id;
  if not found then
    raise exception 'Only the group creator can delete this group.';
  end if;
end;
$$;

create or replace function public.leave_group_conversation(p_conversation_id uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.leave_group_conversation(p_conversation_id); $$;

create or replace function public.delete_group_conversation(p_conversation_id uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.delete_group_conversation(p_conversation_id); $$;

revoke all on function private.leave_group_conversation(uuid) from public, anon;
revoke all on function private.delete_group_conversation(uuid) from public, anon;
grant execute on function private.leave_group_conversation(uuid) to authenticated;
grant execute on function private.delete_group_conversation(uuid) to authenticated;
revoke all on function public.leave_group_conversation(uuid) from public, anon;
revoke all on function public.delete_group_conversation(uuid) from public, anon;
grant execute on function public.leave_group_conversation(uuid) to authenticated;
grant execute on function public.delete_group_conversation(uuid) to authenticated;
