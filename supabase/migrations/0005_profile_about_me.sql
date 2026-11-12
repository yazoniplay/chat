alter table public.profiles
  add column if not exists about_me text;

alter table public.profiles
  drop constraint if exists profiles_about_me_length;
alter table public.profiles
  add constraint profiles_about_me_length
  check (about_me is null or char_length(about_me) <= 300);

grant update (about_me) on public.profiles to authenticated;
