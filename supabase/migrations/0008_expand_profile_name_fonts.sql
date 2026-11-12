alter table public.profiles
  drop constraint if exists profiles_display_name_font_allowed;

alter table public.profiles
  add constraint profiles_display_name_font_allowed
  check (display_name_font in (
    'modern', 'rounded', 'serif', 'mono',
    'poppins', 'montserrat', 'playfair', 'bebas', 'pacifico',
    'space', 'oswald', 'merriweather', 'caveat', 'nunito', 'lora'
  ));