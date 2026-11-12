alter table public.profiles
  add column if not exists display_name_font text not null default 'modern',
  add column if not exists profile_gradient text not null default 'aurora';

alter table public.profiles
  drop constraint if exists profiles_display_name_font_allowed;
alter table public.profiles
  add constraint profiles_display_name_font_allowed
  check (display_name_font in ('modern', 'rounded', 'serif', 'mono'));

alter table public.profiles
  drop constraint if exists profiles_profile_gradient_allowed;
alter table public.profiles
  add constraint profiles_profile_gradient_allowed
  check (profile_gradient in ('aurora', 'sunset', 'ocean', 'berry', 'emerald', 'midnight'));

grant update (display_name_font, profile_gradient) on public.profiles to authenticated;