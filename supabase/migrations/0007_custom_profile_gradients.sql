alter table public.profiles
  add column if not exists profile_gradient_custom text;

grant update (profile_gradient_custom) on public.profiles to authenticated;