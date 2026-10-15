-- ============================================================================
-- Ngachoan — Menu Management migration (sub-project A)
-- Spec: docs/superpowers/specs/2026-10-15-menu-management-design.md
--
-- How to run:
--   Open your Supabase project -> SQL Editor -> paste this whole file -> Run.
--   Safe to run more than once (idempotent where practical).
--
-- Prerequisite:
--   Auth users for owner@ngachoan.com and dapur@ngachoan.com must already
--   exist in Supabase Authentication. This migration links them into `staff`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id),
  name         text not null,
  description  text,
  base_price   numeric(12,2) not null default 0 check (base_price >= 0),
  image_url    text,
  is_available boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.option_groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  selection_type text not null check (selection_type in ('single','multiple')),
  is_required    boolean not null default false,
  min_select     int not null default 0,
  max_select     int,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.option_items (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.option_groups(id) on delete cascade,
  name         text not null,
  price_delta  numeric(12,2) not null default 0,
  is_available boolean not null default true,
  sort_order   int not null default 0
);

create table if not exists public.menu_item_option_groups (
  menu_item_id    uuid not null references public.menu_items(id) on delete cascade,
  option_group_id uuid not null references public.option_groups(id) on delete cascade,
  sort_order      int not null default 0,
  primary key (menu_item_id, option_group_id)
);

create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('owner','manager','kitchen')),
  created_at timestamptz not null default now()
);

-- Indexes for the common lookups
create index if not exists idx_menu_items_category   on public.menu_items(category_id);
create index if not exists idx_option_items_group     on public.option_items(group_id);
create index if not exists idx_miog_group             on public.menu_item_option_groups(option_group_id);

-- ----------------------------------------------------------------------------
-- 2. updated_at TRIGGER for menu_items
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. is_manager() HELPER (SECURITY DEFINER to avoid recursive RLS)
-- ----------------------------------------------------------------------------

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = auth.uid()
      and s.role in ('owner','manager')
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.categories               enable row level security;
alter table public.menu_items               enable row level security;
alter table public.option_groups            enable row level security;
alter table public.option_items             enable row level security;
alter table public.menu_item_option_groups  enable row level security;
alter table public.staff                     enable row level security;

-- Drop existing policies so this migration can be re-run cleanly
drop policy if exists categories_public_read       on public.categories;
drop policy if exists categories_manager_write     on public.categories;
drop policy if exists menu_items_public_read       on public.menu_items;
drop policy if exists menu_items_manager_write     on public.menu_items;
drop policy if exists option_groups_public_read    on public.option_groups;
drop policy if exists option_groups_manager_write  on public.option_groups;
drop policy if exists option_items_public_read     on public.option_items;
drop policy if exists option_items_manager_write   on public.option_items;
drop policy if exists miog_public_read             on public.menu_item_option_groups;
drop policy if exists miog_manager_write           on public.menu_item_option_groups;
drop policy if exists staff_read_own               on public.staff;

-- Public (anon) may read the menu
create policy categories_public_read
  on public.categories for select using (true);
create policy menu_items_public_read
  on public.menu_items for select using (true);
create policy option_groups_public_read
  on public.option_groups for select using (true);
create policy option_items_public_read
  on public.option_items for select using (true);
create policy miog_public_read
  on public.menu_item_option_groups for select using (true);

-- Managers (owner/manager) may write the menu
create policy categories_manager_write
  on public.categories for all
  using (public.is_manager()) with check (public.is_manager());
create policy menu_items_manager_write
  on public.menu_items for all
  using (public.is_manager()) with check (public.is_manager());
create policy option_groups_manager_write
  on public.option_groups for all
  using (public.is_manager()) with check (public.is_manager());
create policy option_items_manager_write
  on public.option_items for all
  using (public.is_manager()) with check (public.is_manager());
create policy miog_manager_write
  on public.menu_item_option_groups for all
  using (public.is_manager()) with check (public.is_manager());

-- Staff may read only their own row
create policy staff_read_own
  on public.staff for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. STORAGE BUCKET + POLICIES
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "menu images public read"  on storage.objects;
drop policy if exists "menu images manager write" on storage.objects;

create policy "menu images public read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

create policy "menu images manager write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'menu-images' and public.is_manager())
  with check (bucket_id = 'menu-images' and public.is_manager());

-- ----------------------------------------------------------------------------
-- 6. SEED DATA (deterministic IDs so re-runs are safe)
-- ----------------------------------------------------------------------------

-- Categories
insert into public.categories (id, name, sort_order) values
  ('00000000-0000-4000-a000-000000000001', 'Mie',     1),
  ('00000000-0000-4000-a000-000000000002', 'Dimsum',  2),
  ('00000000-0000-4000-a000-000000000003', 'Minuman', 3)
on conflict (id) do nothing;

-- Menu items (from the original src/data/menuData.js)
insert into public.menu_items (id, category_id, name, description, base_price, image_url, is_available, sort_order) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001',
   'Mie Ngachoan Level 1-4', 'Mie pedas gurih taburan ayam cincang dan pangsit goreng kriuk.',
   15000, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=60', true, 1),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001',
   'Mie Iblis Level 5-8', 'Mie pedas manis dengan bumbu rahasia yang membakar lidah.',
   16500, 'https://images.unsplash.com/photo-1552611052-33e04de081de?w=500&auto=format&fit=crop&q=60', true, 2),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002',
   'Dimsum Siomay (Isi 3)', 'Siomay ayam udang lembut disajikan hangat dengan chili oil.',
   13000, 'https://images.unsplash.com/photo-1496116211227-7d3ccb8f4128?w=500&auto=format&fit=crop&q=60', true, 3),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000002',
   'Dimsum Udang Keju', 'Balutan udang krispi dengan lelehan keju lumer di dalamnya.',
   14000, 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=500&auto=format&fit=crop&q=60', true, 4),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000003',
   'Es Genderuwo', 'Es segar buah-buahan dengan jeli dan sirup merah merona.',
   10000, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60', true, 5),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000003',
   'Es Pocong', 'Kesegaran es lemon tea dipadu dengan perasan jeruk nipis murni.',
   9000, 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=500&auto=format&fit=crop&q=60', true, 6)
on conflict (id) do nothing;

-- Reusable option group: Level Pedas
insert into public.option_groups (id, name, selection_type, is_required, min_select, max_select, sort_order) values
  ('00000000-0000-4000-c000-000000000001', 'Level Pedas', 'single', true, 1, 1, 1)
on conflict (id) do nothing;

insert into public.option_items (id, group_id, name, price_delta, is_available, sort_order) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001', 'Level 1-4', 0,    true, 1),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-c000-000000000001', 'Level 5-8', 1500, true, 2)
on conflict (id) do nothing;

-- Attach the group to the two Mie items
insert into public.menu_item_option_groups (menu_item_id, option_group_id, sort_order) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 1),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000001', 1)
on conflict (menu_item_id, option_group_id) do nothing;

-- Staff roles linked to existing auth users
insert into public.staff (user_id, email, role)
select u.id, u.email, v.role
from (values
  ('owner@ngachoan.com', 'owner'),
  ('dapur@ngachoan.com', 'kitchen')
) as v(email, role)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (user_id) do update set role = excluded.role, email = excluded.email;

-- ----------------------------------------------------------------------------
-- 7. SANITY CHECKS (optional — inspect results in the SQL editor)
-- ----------------------------------------------------------------------------
-- select count(*) as categories from public.categories;      -- expect 3
-- select count(*) as menu_items from public.menu_items;      -- expect 6
-- select count(*) as staff_rows from public.staff;           -- expect 2
