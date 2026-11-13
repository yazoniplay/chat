alter table public.conversations add column if not exists description text not null default '';
alter table public.conversations add constraint conversations_description_length_check check (char_length(description) <= 500);
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind = any (array['text','gif','image','emoji','ai']::text[]));

create or replace function public.leave_group_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'You must be signed in to leave a group.'; end if;
  if not exists (select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id where c.id=p_conversation_id and c.is_group=true and cm.user_id=current_user_id) then
    raise exception 'You are not a member of this group.';
  end if;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=current_user_id;
  if not exists (select 1 from public.conversation_members where conversation_id=p_conversation_id) then
    delete from public.conversations where id=p_conversation_id and is_group=true;
  end if;
end;
$$;
revoke all on function public.leave_group_conversation(uuid) from public, anon;
grant execute on function public.leave_group_conversation(uuid) to authenticated;

create or replace function public.update_group_description(p_conversation_id uuid, p_description text)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'You must be signed in.'; end if;
  if char_length(coalesce(p_description,'')) > 500 then raise exception 'Description must be 500 characters or fewer.'; end if;
  if not exists (select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id where c.id=p_conversation_id and c.is_group=true and cm.user_id=current_user_id) then
    raise exception 'Only group members can edit this description.';
  end if;
  update public.conversations set description=coalesce(p_description,'') where id=p_conversation_id and is_group=true;
end;
$$;
revoke all on function public.update_group_description(uuid,text) from public, anon;
grant execute on function public.update_group_description(uuid,text) to authenticated;
notify pgrst, 'reload schema';
