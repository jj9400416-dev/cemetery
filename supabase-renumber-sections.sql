-- One-time section renumbering for Agnipa Memorial Park.
-- Run once in Supabase Dashboard → SQL Editor.
--
-- Mapping (old → new):
--   S11→S1, S10→S2, S9→S3, S6→S4, S8→S6, S4→S8, S3→S9, S1→S10, S2→S11
--   (S5 and S7 are unchanged.)
--
-- A single UPDATE computes every new value from the original section, so the
-- swaps can't cascade (Postgres evaluates the right-hand side against the
-- pre-update row).

update public.graves
set section = case section
  when 'S11' then 'S1'
  when 'S10' then 'S2'
  when 'S9'  then 'S3'
  when 'S6'  then 'S4'
  when 'S8'  then 'S6'
  when 'S4'  then 'S8'
  when 'S3'  then 'S9'
  when 'S1'  then 'S10'
  when 'S2'  then 'S11'
  else section
end
where section in ('S1','S2','S3','S4','S6','S8','S9','S10','S11');

-- Sanity check: every section should still be within S1-S11 with the expected
-- counts. Uncomment to verify after running.
-- select section, count(*) from public.graves group by section order by 1;
