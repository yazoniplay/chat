alter table public.profiles
  add column if not exists profile_effect text not null default 'none'
    check (profile_effect in ('none','glow','shimmer','aurora','sparkle')),
  add column if not exists avatar_decoration text not null default 'none'
    check (avatar_decoration in ('none','halo','orbit','crown','diamond','flame'));
create schema if not exists private;
create table if not exists public.profile_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null check (badge_key in ('founder','early_supporter')),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);
alter table public.profile_badges enable row level security;
grant select on public.profile_badges to authenticated;
drop policy if exists "Badges are visible to signed-in users" on public.profile_badges;
create policy "Badges are visible to signed-in users" on public.profile_badges for select to authenticated using (true);
create or replace function private.assign_profile_launch_badges()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare account_rank bigint;
begin
  select count(*) + 1 into account_rank from public.profiles
  where (created_at, id) < (new.created_at, new.id);
  if account_rank = 1 then
    insert into public.profile_badges(user_id, badge_key) values (new.id, 'founder') on conflict do nothing;
  end if;
  if account_rank <= 10 then
    insert into public.profile_badges(user_id, badge_key) values (new.id, 'early_supporter') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_profile_launch_badges() from public, anon, authenticated;
drop trigger if exists assign_profile_launch_badges on public.profiles;
create trigger assign_profile_launch_badges after insert on public.profiles for each row execute function private.assign_profile_launch_badges();
with ranked as (select id, row_number() over (order by created_at, id) as position from public.profiles)
insert into public.profile_badges(user_id, badge_key) select id, 'founder' from ranked where position=1 on conflict do nothing;
with ranked as (select id, row_number() over (order by created_at, id) as position from public.profiles)
insert into public.profile_badges(user_id, badge_key) select id, 'early_supporter' from ranked where position<=10 on conflict do nothing;
