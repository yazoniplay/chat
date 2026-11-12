alter table public.profiles drop constraint if exists profiles_avatar_decoration_check;
update public.profiles set avatar_decoration = 'none' where avatar_decoration not in ('none','halo');
alter table public.profiles add constraint profiles_avatar_decoration_check
  check (avatar_decoration in ('none','halo','angel','cat_ears','nightwraith','solar_flare','comets','hologram_dragon','malefic_crown','fire','aurora'));
