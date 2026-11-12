alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null,
  add column if not exists forwarded_from uuid,
  add column if not exists edited_at timestamptz;

drop policy if exists "Authors can edit their messages" on public.messages;
create policy "Authors can edit their messages"
on public.messages for update to authenticated
using (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id))
with check (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));

drop policy if exists "Authors can delete their messages" on public.messages;
create policy "Authors can delete their messages"
on public.messages for delete to authenticated
using (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));
