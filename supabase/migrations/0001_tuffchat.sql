-- Tuffchat starter schema. Run this whole file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 10000),
  kind text not null default 'text' check (kind in ('text', 'gif')),
  created_at timestamptz not null default now()
);

create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

-- Security-definer helpers avoid recursive RLS policies on membership lookups.
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_add_conversation_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation and c.created_by = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.can_add_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.can_add_conversation_member(uuid) to authenticated;

-- Create a profile automatically from signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  if chosen_username !~ '^[a-z0-9_]{3,20}$' then
    chosen_username := 'user_' || replace(new.id::text, '-', '');
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, chosen_username, coalesce(new.raw_user_meta_data ->> 'display_name', chosen_username))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tuffchat on auth.users;
create trigger on_auth_user_created_tuffchat
  after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Signed-in users can find profiles" on public.profiles;
create policy "Signed-in users can find profiles" on public.profiles
for select to authenticated using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Members can view conversations" on public.conversations;
create policy "Members can view conversations" on public.conversations
for select to authenticated using (public.is_conversation_member(id));

drop policy if exists "Users create conversations" on public.conversations;
create policy "Users create conversations" on public.conversations
for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "Members can view membership" on public.conversation_members;
create policy "Members can view membership" on public.conversation_members
for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists "Creator or self can join conversation" on public.conversation_members;
create policy "Creator or self can join conversation" on public.conversation_members
for insert to authenticated
with check (
  user_id = (select auth.uid())
  or public.can_add_conversation_member(conversation_id)
);

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages" on public.messages
for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can send as themselves" on public.messages;
create policy "Members can send as themselves" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);

-- Enable message inserts/updates to reach subscribed clients through Supabase Realtime.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;