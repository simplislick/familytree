-- Per-account settings (currently just an avatar), independent of any tree
-- membership — a silent anon user may own trees or belong to none, and may
-- have zero, one, or several claimed persons rows across trees, so this
-- can't live on `persons`.
-- Apply with: supabase db push  (or paste into the SQL editor)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
