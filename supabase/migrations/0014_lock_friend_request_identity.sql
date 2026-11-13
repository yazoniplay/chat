revoke update on public.friend_requests from authenticated;
grant update (status, updated_at) on public.friend_requests to authenticated;