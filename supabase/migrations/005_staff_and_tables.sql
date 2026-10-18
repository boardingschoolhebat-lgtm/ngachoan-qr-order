-- ============================================================================
-- Ngachoan — Staff, roles & tables migration (sub-project D)
-- Spec: docs/superpowers/specs/2026-10-15-staff-roles-tables-design.md
--
-- Run AFTER 001 (staff table + is_manager()) and optionally 002/004.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STAFF EXTRA COLUMNS
-- ----------------------------------------------------------------------------

alter table public.staff
  add column if not exists display_name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- 2. TABLES (dining tables / QR anchors)
-- ----------------------------------------------------------------------------

create table if not exists public.restaurant_tables (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  zone       text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_tables_sort on public.restaurant_tables(sort_order);

alter table public.restaurant_tables enable row level security;

drop policy if exists tables_public_read   on public.restaurant_tables;
drop policy if exists tables_manager_write on public.restaurant_tables;

create policy tables_public_read
  on public.restaurant_tables for select using (true);

create policy tables_manager_write
  on public.restaurant_tables for all
  using (public.is_manager()) with check (public.is_manager());

-- Seed a starter set only when the table is empty.
insert into public.restaurant_tables (label, zone, sort_order)
select v.label, v.zone, v.sort_order
from (values
  ('MEJA-01', 'Indoor', 1),
  ('MEJA-02', 'Indoor', 2),
  ('MEJA-03', 'Indoor', 3),
  ('MEJA-04', 'Indoor', 4),
  ('MEJA-05', 'Outdoor', 5),
  ('MEJA-06', 'Outdoor', 6)
) as v(label, zone, sort_order)
where not exists (select 1 from public.restaurant_tables);

-- ----------------------------------------------------------------------------
-- 3. STAFF RLS: managers can read all staff, owners can manage roles
-- ----------------------------------------------------------------------------

drop policy if exists staff_read_manager on public.staff;
create policy staff_read_manager
  on public.staff for select
  using (public.is_manager());

-- Client-side writes to `staff` stay closed. Account creation and role changes
-- go through the staff-admin Edge Function (service role).

-- ----------------------------------------------------------------------------
-- 4. HELPER: current user's role (used by the frontend and the Edge Function)
-- ----------------------------------------------------------------------------

create or replace function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.role
  from public.staff s
  where s.user_id = auth.uid()
    and s.is_active = true
  limit 1;
$$;

grant execute on function public.my_staff_role() to authenticated, anon;

-- ----------------------------------------------------------------------------
-- 5. KITCHEN ACCESS HELPER (kitchen, owner, manager)
-- ----------------------------------------------------------------------------

create or replace function public.is_kitchen_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.is_active = true
      and s.role in ('kitchen','owner','manager')
  );
$$;

grant execute on function public.is_kitchen_staff() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. SANITY CHECKS (optional)
-- ----------------------------------------------------------------------------
-- select label, zone, is_active from public.restaurant_tables order by sort_order;
-- select email, role, is_active from public.staff;
