-- Freeform canvas position for placed-but-unconnected persons (ComfyUI-style
-- node canvas: dropped from the drawer at a grid-snapped spot, draggable
-- afterward). Ignored once a person is connected — the pedigree layout
-- takes over positioning at that point.
-- Apply with: supabase db push  (or paste into the SQL editor)

alter table public.persons add column position_x integer;
alter table public.persons add column position_y integer;
