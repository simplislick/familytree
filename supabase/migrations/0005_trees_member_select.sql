-- Lets a joined (non-owner) member read the trees they belong to, so the
-- landing page can list "my trees" as owner-or-member instead of owner-only.
-- Apply with: supabase db push  (or paste into the SQL editor)

create policy trees_member_select on public.trees
  for select using (public.is_tree_member(id));
