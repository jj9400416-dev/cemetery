-- User-traced walking routes for Agnipa Memorial Park.
-- Run in Supabase Dashboard → SQL Editor.
-- Approved accounts trace routes on the map page (/find); each grave keeps
-- one route, which wins over the bundled extractions.

create table if not exists public.custom_routes (
  grave text primary key,
  waypoints jsonb not null,
  entrance text not null default 'entranceMain',
  created_at timestamptz default now()
);

alter table public.custom_routes enable row level security;

drop policy if exists "Anyone can view custom routes" on public.custom_routes;
create policy "Anyone can view custom routes"
  on public.custom_routes for select
  to anon, authenticated
  using (true);

drop policy if exists "Signed-in users save routes" on public.custom_routes;
create policy "Signed-in users save routes"
  on public.custom_routes for insert
  to authenticated
  with check (true);

drop policy if exists "Signed-in users update routes" on public.custom_routes;
create policy "Signed-in users update routes"
  on public.custom_routes for update
  to authenticated
  using (true)
  with check (true);
