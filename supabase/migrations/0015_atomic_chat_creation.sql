-- Atomic, authenticated chat creation. The private functions validate every participant
-- and create the conversation plus all memberships in one transaction.
create or replace function private.create_direct_conversation(p_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to start a chat.';
  end if;
  if p_target_user_id is null or p_target_user_id = current_user_id then
    raise exception 'Choose another user to start a direct chat.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_target_user_id and p.deletion_requested_at is null
  ) then
    raise exception 'That account is unavailable.';
  end if;
  if not exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = current_user_id and fr.addressee_id = p_target_user_id)
        or (fr.requester_id = p_target_user_id and fr.addressee_id = current_user_id))
  ) then
    raise exception 'You can only message people who have accepted your friend request.';
  end if;

  select c.id into conversation_id
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where c.is_group = false
  group by c.id
  having count(*) = 2
    and count(*) filter (where cm.user_id = current_user_id) = 1
    and count(*) filter (where cm.user_id = p_target_user_id) = 1
  order by max(c.created_at) desc
  limit 1;

  if conversation_id is null then
    insert into public.conversations (created_by, is_group)
    values (current_user_id, false)
    returning id into conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (conversation_id, current_user_id),
           (conversation_id, p_target_user_id);
  end if;

  return conversation_id;
end;
$$;

create or replace function private.create_group_conversation(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  conversation_id uuid;
  clean_name text := nullif(btrim(coalesce(p_name, '')), '');
  selected_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'You must be signed in to create a group.';
  end if;
  if clean_name is null or char_length(clean_name) > 60 then
    raise exception 'Group names must be between 1 and 60 characters.';
  end if;

  select coalesce(array_agg(distinct member_id), array[]::uuid[])
    into selected_ids
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as member_id
  where member_id is not null and member_id <> current_user_id;

  if cardinality(selected_ids) < 1 then
    raise exception 'Choose at least one friend for your group.';
  end if;
  if cardinality(selected_ids) > 49 then
    raise exception 'Groups can have up to 50 members.';
  end if;

  if exists (
    select 1 from unnest(selected_ids) as member_id
    where not exists (
      select 1 from public.profiles p
      where p.id = member_id and p.deletion_requested_at is null
    )
  ) then
    raise exception 'One or more selected accounts are unavailable.';
  end if;

  if exists (
    select 1 from unnest(selected_ids) as member_id
    where not exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = current_user_id and fr.addressee_id = member_id)
          or (fr.requester_id = member_id and fr.addressee_id = current_user_id))
    )
  ) then
    raise exception 'Groups can only include your accepted friends.';
  end if;

  insert into public.conversations (created_by, name, is_group)
  values (current_user_id, clean_name, true)
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  select conversation_id, current_user_id
  union all
  select conversation_id, member_id from unnest(selected_ids) as member_id;

  return conversation_id;
end;
$$;

revoke all on function private.create_direct_conversation(uuid) from public, anon;
revoke all on function private.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function private.create_direct_conversation(uuid) to authenticated;
grant execute on function private.create_group_conversation(text, uuid[]) to authenticated;

-- Public RPC entry points are SECURITY INVOKER; authorization and atomic writes
-- live in the private functions above.
create or replace function public.create_direct_conversation(p_target_user_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_direct_conversation(p_target_user_id); $$;

create or replace function public.create_group_conversation(p_name text, p_member_ids uuid[])
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_group_conversation(p_name, p_member_ids); $$;

revoke all on function public.create_direct_conversation(uuid) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
