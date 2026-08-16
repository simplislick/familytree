-- Demo seed: a sample tree with placeholder persons so the join / claim /
-- position flows can be tested once a Supabase project is connected.
--
-- Usage:
--   1. Apply supabase/migrations/0001_init.sql first.
--   2. Sign up at least one user in the app (they become the demo tree owner).
--   3. Run this file in the Supabase SQL editor (or `supabase db query`).
--   4. Open /t/demo-share-token in the app.
--
-- Placeholders grandma@example.com / +15551234567 are intended for claim
-- testing: join the tree with that email or phone to claim the placeholder.

do $$
declare
  v_owner uuid;
  v_tree uuid;
  v_grandpa uuid;
  v_grandma uuid;
  v_parent uuid;
  v_parent_spouse uuid;
  v_child uuid;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise exception 'No auth users found. Sign up in the app first, then re-run this seed.';
  end if;

  insert into public.trees (name, owner_id, share_token)
  values ('Demo Family', v_owner, 'demo-share-token')
  on conflict (share_token) do nothing
  returning id into v_tree;

  if v_tree is null then
    raise notice 'Demo tree already exists; skipping.';
    return;
  end if;

  insert into public.persons (tree_id, user_id, full_name, birth_date, created_by)
  values (v_tree, v_owner, 'George Demo', '1950-03-04', v_owner)
  returning id into v_grandpa;

  insert into public.persons (tree_id, user_id, full_name, birth_date, email, phone, created_by)
  values (v_tree, null, 'Grace Demo', '1952-07-19', 'grandma@example.com', '+1 (555) 123-4567', v_owner)
  returning id into v_grandma;

  insert into public.persons (tree_id, user_id, full_name, birth_date, created_by)
  values (v_tree, null, 'Pat Demo', '1975-01-30', v_owner)
  returning id into v_parent;

  insert into public.persons (tree_id, user_id, full_name, birth_date, created_by)
  values (v_tree, null, 'Sam Demo', '1976-11-12', v_owner)
  returning id into v_parent_spouse;

  insert into public.persons (tree_id, user_id, full_name, birth_date, created_by)
  values (v_tree, null, 'Casey Demo', '2001-05-08', v_owner)
  returning id into v_child;

  insert into public.relationships (tree_id, person_id, related_person_id, type, created_by)
  values
    (v_tree, v_grandpa, v_grandma, 'spouse', v_owner),
    (v_tree, v_parent, v_grandpa, 'parent', v_owner),
    (v_tree, v_parent, v_grandma, 'parent', v_owner),
    (v_tree, v_parent, v_parent_spouse, 'spouse', v_owner),
    (v_tree, v_child, v_parent, 'parent', v_owner),
    (v_tree, v_child, v_parent_spouse, 'parent', v_owner);

  raise notice 'Seeded Demo Family at /t/demo-share-token (owner: %)', v_owner;
end $$;
