create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (requester_id <> addressee_id)
);

create unique index friend_requests_one_active_pair
on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
where status in ('pending','accepted');

create index friend_requests_addressee_status_idx
on public.friend_requests (addressee_id, status, created_at desc);
create index friend_requests_requester_status_idx
on public.friend_requests (requester_id, status, created_at desc);

alter table public.friend_requests enable row level security;
grant select, insert, update, delete on public.friend_requests to authenticated;

create policy "Users can view their own friend requests"
on public.friend_requests for select to authenticated
using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create policy "Users can send friend requests"
on public.friend_requests for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_id <> addressee_id
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = addressee_id and p.deletion_requested_at is null
  )
);

create policy "Recipients can respond to friend requests"
on public.friend_requests for update to authenticated
using (addressee_id = (select auth.uid()) and status = 'pending')
with check (
  addressee_id = (select auth.uid())
  and status in ('accepted','rejected')
);

create policy "Participants can remove friend requests or friendships"
on public.friend_requests for delete to authenticated
using (
  (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()))
  and (status = 'accepted' or (status = 'pending' and requester_id = (select auth.uid())) or status = 'rejected')
);
