-- Tuffchat profile personalization: banners and status messages.
alter table public.profiles
  add column if not exists banner_url text,
  add column if not exists status_message text;

alter table public.profiles
  drop constraint if exists profiles_status_message_length;
alter table public.profiles
  add constraint profiles_status_message_length
  check (status_message is null or char_length(status_message) <= 60);

grant update (banner_url, status_message) on public.profiles to authenticated;