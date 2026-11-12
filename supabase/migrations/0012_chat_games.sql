create table if not exists public.chat_games (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  game_type text not null default 'chess' check (game_type in ('chess')),
  status text not null default 'pending' check (status in ('pending','active','finished','declined')),
  opponent_type text not null check (opponent_type in ('human','ai')),
  created_by uuid not null references auth.users(id) on delete cascade,
  white_player uuid references auth.users(id) on delete set null,
  black_player uuid references auth.users(id) on delete set null,
  fen text not null,
  pgn text not null default '',
  winner uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_games_players_check check (
    (opponent_type = 'ai' and white_player is not null and black_player is null)
    or
    (opponent_type = 'human' and white_player is not null and black_player is not null and white_player <> black_player)
  )
);

create index if not exists chat_games_conversation_updated_idx
  on public.chat_games (conversation_id, updated_at desc);

alter table public.chat_games enable row level security;

drop policy if exists "Conversation members can read chat games" on public.chat_games;
create policy "Conversation members can read chat games"
on public.chat_games for select to authenticated
using (exists (
  select 1 from public.conversation_members cm
  where cm.conversation_id = chat_games.conversation_id
    and cm.user_id = (select auth.uid())
));

drop policy if exists "Members can create chat games" on public.chat_games;
create policy "Members can create chat games"
on public.chat_games for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = chat_games.conversation_id
      and cm.user_id = (select auth.uid())
  )
  and (
    (opponent_type = 'ai' and white_player = (select auth.uid()) and black_player is null)
    or
    (opponent_type = 'human'
      and white_player is not null and black_player is not null
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = chat_games.conversation_id and cm.user_id = chat_games.white_player)
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = chat_games.conversation_id and cm.user_id = chat_games.black_player))
  )
);

drop policy if exists "Players can update chat games" on public.chat_games;
create policy "Players can update chat games"
on public.chat_games for update to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = chat_games.conversation_id
      and cm.user_id = (select auth.uid())
  )
  and (
    white_player = (select auth.uid())
    or black_player = (select auth.uid())
    or (opponent_type = 'ai' and created_by = (select auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = chat_games.conversation_id
      and cm.user_id = (select auth.uid())
  )
  and (
    white_player = (select auth.uid())
    or black_player = (select auth.uid())
    or (opponent_type = 'ai' and created_by = (select auth.uid()))
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_games'
  ) then
    alter publication supabase_realtime add table public.chat_games;
  end if;
end $$;

grant select, insert, update on public.chat_games to authenticated;