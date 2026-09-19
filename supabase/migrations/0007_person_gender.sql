alter table public.persons
  add column gender text check (gender in ('male', 'female'));
