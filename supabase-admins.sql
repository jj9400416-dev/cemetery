-- Admin approval for Agnipa Memorial Park.
-- Run in Supabase Dashboard → SQL Editor.
-- Flow: users sign up in the app (/signup) → their email lands in
-- admin_requests → an admin clicks Approve in the dashboard (/admin),
-- which inserts the email into admins → they can sign in at /login.
-- Login matches on EMAIL, so approvals never need user IDs.

-- 1. Admin allow-list (keyed by email).
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

drop policy if exists "Authenticated users can read admins" on public.admins;
create policy "Authenticated users can read admins"
  on public.admins for select
  to authenticated
  using (true);

-- Dashboard approvals insert here (only signed-in admins reach the dashboard).
drop policy if exists "Admins can add admins" on public.admins;
create policy "Admins can add admins"
  on public.admins for insert
  to authenticated
  with check (true);

-- 2. Approval request queue, filled automatically at sign-up.
create table if not exists public.admin_requests (
  email text primary key,
  created_at timestamptz default now()
);

alter table public.admin_requests enable row level security;

drop policy if exists "Anyone can request access" on public.admin_requests;
create policy "Anyone can request access"
  on public.admin_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Signed-in users view requests" on public.admin_requests;
create policy "Signed-in users view requests"
  on public.admin_requests for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users clear requests" on public.admin_requests;
create policy "Signed-in users clear requests"
  on public.admin_requests for delete
  to authenticated
  using (true);

-- 3. MIGRATION — only if you already ran the old id-keyed admins table.
-- Run this block, then the blocks above:
--   alter table public.admins drop constraint if exists admins_id_fkey;
--   alter table public.admins drop constraint if exists admins_pkey;
--   alter table public.admins alter column id drop not null;
--   alter table public.admins add primary key (email);

-- 3. AUTO-APPROVAL (recommended): a trigger on auth.users admins every new
-- sign-up instantly — no dashboard click needed. Combined with the app, which
-- signs the account straight in after creation.
create or replace function public.handle_new_user_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.admins (email)
  values (new.email)
  on conflict (email) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_request on auth.users;
create trigger on_auth_user_created_request
  after insert on auth.users
  for each row execute function public.handle_new_user_request();

-- 4. APPROVE EXISTING accounts in one go (e.g. snxpaulo@gmail.com):
--   insert into public.admins (email)
--   select email from auth.users
--   on conflict (email) do nothing;

-- Manual approve / remove (without the dashboard):
--   insert into public.admins (email) values ('you@example.com')
--   on conflict (email) do nothing;
--   delete from public.admins where email = 'you@example.com';
