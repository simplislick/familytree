-- Lets the owner drop an unconnected person onto the tree canvas without
-- picking a relation yet. Placed-but-unconnected persons show in a grid on
-- the canvas instead of the side drawer; dragging one onto an existing node
-- still connects it (and removes it from the grid) the same way the drawer
-- always worked.
-- Apply with: supabase db push  (or paste into the SQL editor)

alter table public.persons add column placed boolean not null default false;
