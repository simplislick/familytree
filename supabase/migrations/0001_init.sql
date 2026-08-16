-- Family Tree Platform MVP — initial schema, RLS, and RPCs
-- Apply with: supabase db push  (or paste into the SQL editor)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Normalize a phone number to digits only, dropping a leading US country code.
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when d is null then null
    when length(d) = 11 and d like '1%' then substr(d, 2)
    else d
  end
  from (select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') as d) as s;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  share_token text not null unique,
  created_at timestamptz not null default now()
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null, -- null = unclaimed placeholder
  full_name text not null,
  birth_date date,
  email text,
  phone text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  related_person_id uuid not null references public.persons (id) on delete cascade,
  type text not null check (type in ('parent', 'spouse')), -- child/sibling derived from parent edges
  created_by uuid not null references auth.users (id),
  check (person_id <> related_person_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade, -- tree owner
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index persons_tree_id_idx on public.persons (tree_id);
create index persons_user_id_idx on public.persons (user_id);
create index persons_email_idx on public.persons (lower(email)) where email is not null;
create index relationships_tree_id_idx on public.relationships (tree_id);
create index relationships_person_idx on public.relationships (person_id, related_person_id);
create index notifications_recipient_idx on public.notifications (recipient_id, read);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.trees enable row level security;
alter table public.persons enable row level security;
alter table public.relationships enable row level security;
alter table public.notifications enable row level security;

-- True when the current user owns the tree.
create or replace function public.is_tree_owner(p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trees t
    where t.id = p_tree_id and t.owner_id = auth.uid()
  );
$$;

-- True when p_recipient owns p_tree_id (definer rights, so joiners can use
-- it in the notifications insert policy without read access to trees).
create or replace function public.owns_tree(p_recipient uuid, p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trees t
    where t.id = p_tree_id and t.owner_id = p_recipient
  );
$$;

-- True when the current user has a claimed profile in the tree.
create or replace function public.is_tree_member(p_tree_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.persons p
    where p.tree_id = p_tree_id and p.user_id = auth.uid()
  );
$$;

-- trees: owner full access. Shared-link reads go through get_tree_by_token().
create policy trees_owner_select on public.trees
  for select using (owner_id = auth.uid());
create policy trees_owner_insert on public.trees
  for insert with check (owner_id = auth.uid());
create policy trees_owner_update on public.trees
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy trees_owner_delete on public.trees
  for delete using (owner_id = auth.uid());

-- persons: readable by owner and members of the tree (shared-link reads go
-- through get_tree_data()). Joiners insert their own profile; the owner
-- inserts placeholders. Owner can update/delete anything; members update self.
create policy persons_tree_read on public.persons
  for select using (public.is_tree_owner(tree_id) or public.is_tree_member(tree_id));
create policy persons_self_insert on public.persons
  for insert with check (
    created_by = auth.uid()
    and (user_id = auth.uid() or (user_id is null and public.is_tree_owner(tree_id)))
  );
create policy persons_update on public.persons
  for update using (public.is_tree_owner(tree_id) or user_id = auth.uid())
  with check (public.is_tree_owner(tree_id) or user_id = auth.uid());
create policy persons_owner_delete on public.persons
  for delete using (public.is_tree_owner(tree_id));

-- relationships: readable within the tree; members/owner insert; owner moderates.
create policy relationships_tree_read on public.relationships
  for select using (public.is_tree_owner(tree_id) or public.is_tree_member(tree_id));
create policy relationships_insert on public.relationships
  for insert with check (
    created_by = auth.uid()
    and (public.is_tree_owner(tree_id) or public.is_tree_member(tree_id))
  );
create policy relationships_owner_update on public.relationships
  for update using (public.is_tree_owner(tree_id)) with check (public.is_tree_owner(tree_id));
create policy relationships_owner_delete on public.relationships
  for delete using (public.is_tree_owner(tree_id));

-- notifications: only the recipient can read/update; any authenticated
-- joiner can notify a tree's owner (recipient must own the tree).
create policy notifications_recipient_select on public.notifications
  for select using (recipient_id = auth.uid());
create policy notifications_recipient_update on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_insert on public.notifications
  for insert with check (public.owns_tree(recipient_id, tree_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Fetch a tree by its share token (drives /t/[token] pages for everyone,
-- including anonymous visitors).
create or replace function public.get_tree_by_token(p_token text)
returns table (id uuid, name text, owner_id uuid, share_token text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.owner_id, t.share_token, t.created_at
  from public.trees t
  where t.share_token = p_token;
$$;

-- Fetch all persons + relationships for a tree by share token.
create or replace function public.get_tree_data(p_token text)
returns table (
  persons jsonb,
  relationships jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at)
              from public.persons p where p.tree_id = t.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r))
              from public.relationships r where r.tree_id = t.id), '[]'::jsonb)
  from public.trees t
  where t.share_token = p_token;
$$;

-- Match-and-claim: run when a verified user joins a tree. Matches on exact
-- (case-insensitive) email or normalized phone against that tree's persons.
-- Unclaimed placeholder -> claimed for the caller. Already claimed by the
-- caller -> attached. Claimed by someone else -> error. No match -> 'new',
-- and the caller proceeds to self-positioning. Runs as one function call, so
-- the match + claim is a single transaction and cannot double-claim.
create or replace function public.claim_or_create_person(
  p_tree_id uuid,
  p_full_name text,
  p_birth_date date default null,
  p_email text default null,
  p_phone text default null
)
returns table (person_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := public.normalize_phone(p_phone);
  v_person public.persons%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.* into v_person
  from public.persons p
  where p.tree_id = p_tree_id
    and (
      (v_email is not null and p.email is not null and lower(p.email) = v_email)
      or (v_phone is not null and p.phone is not null and public.normalize_phone(p.phone) = v_phone)
    )
  order by p.created_at
  limit 1
  for update;

  if not found then
    return query select null::uuid, 'new'::text;
    return;
  end if;

  if v_person.user_id is null then
    update public.persons
    set user_id = v_uid,
        email = coalesce(v_email, email),
        phone = coalesce(v_phone, phone)
    where id = v_person.id;
    return query select v_person.id, 'claimed'::text;
    return;
  end if;

  if v_person.user_id = v_uid then
    return query select v_person.id, 'attached'::text;
    return;
  end if;

  raise exception 'this profile has already been claimed by another account';
end;
$$;
