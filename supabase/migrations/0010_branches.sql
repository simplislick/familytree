-- List-view branches: a pair of people from one generation that the owner
-- has opened as a staging area for adding their children. Children
-- themselves are still ordinary `parent` edges in `relationships`; this
-- table only remembers which branches are open. Owner-only, so it is not
-- exposed through get_tree_data().
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  parent_a_id uuid not null references public.persons (id) on delete cascade,
  parent_b_id uuid not null references public.persons (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint branches_distinct_parents check (parent_a_id <> parent_b_id)
);

-- One branch per pair, regardless of which parent was picked first.
create unique index branches_pair_idx on public.branches
  (tree_id, least(parent_a_id, parent_b_id), greatest(parent_a_id, parent_b_id));
-- FK indexes, so cascading person deletes don't scan the table.
create index branches_parent_a_idx on public.branches (parent_a_id);
create index branches_parent_b_idx on public.branches (parent_b_id);

alter table public.branches enable row level security;

create policy branches_owner_select on public.branches
  for select using (public.is_tree_owner(tree_id));
create policy branches_owner_insert on public.branches
  for insert with check (created_by = (select auth.uid()) and public.is_tree_owner(tree_id));
create policy branches_owner_delete on public.branches
  for delete using (public.is_tree_owner(tree_id));
