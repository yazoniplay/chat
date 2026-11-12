create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_conversation_member(uuid) set schema private;
alter function public.can_add_conversation_member(uuid) set schema private;
alter function public.handle_new_user() set schema private;

revoke all on function private.is_conversation_member(uuid) from public, anon;
revoke all on function private.can_add_conversation_member(uuid) from public, anon;
revoke all on function private.handle_new_user() from public, anon, authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_add_conversation_member(uuid) to authenticated;

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations
for select to authenticated using (private.is_conversation_member(id));

drop policy if exists "Members can view membership" on public.conversation_members;
create policy "Members can view membership" on public.conversation_members
for select to authenticated using (private.is_conversation_member(conversation_id));

drop policy if exists "Creator or self can join conversation" on public.conversation_members;
create policy "Creator or self can join conversation" on public.conversation_members
for insert to authenticated
with check (private.can_add_conversation_member(conversation_id));

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
for select to authenticated using (private.is_conversation_member(conversation_id));

drop policy if exists "Members can send as themselves" on public.messages;
create policy "Members can send as themselves" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and private.is_conversation_member(conversation_id)
);

create index if not exists conversations_created_by_idx on public.conversations(created_by);
create index if not exists messages_sender_id_idx on public.messages(sender_id);