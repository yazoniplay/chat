alter table public.messages drop constraint if exists messages_kind_check;

alter table public.messages
  add constraint messages_kind_check
  check (kind = any (array['text'::text, 'gif'::text, 'image'::text]));
