-- ============================================================================
-- Ngachoan — Order & Payment Lifecycle migration (sub-project B)
-- Spec: docs/superpowers/specs/2026-10-15-order-payment-lifecycle-design.md
--
-- How to run:
--   Supabase -> SQL Editor -> paste this file -> Run.
--   Run AFTER 001_menu_management.sql.
--
-- Design notes:
--   * orders.id is referenced as text (id::text) so this works whether the
--     column is bigint or uuid.
--   * The legacy `status` column is kept and kept in sync by a trigger until
--     003_drop_legacy_status.sql is applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NEW COLUMNS
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists payment_status text not null default 'UNPAID',
  add column if not exists order_status text not null default 'PENDING',
  add column if not exists fulfillment_status text not null default 'PENDING',
  add column if not exists payment_method text not null default 'CASH',
  add column if not exists kitchen_released boolean not null default false;

-- Check constraints (added separately so re-runs do not fail on duplicates)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_check') then
    alter table public.orders add constraint orders_payment_status_check
      check (payment_status in ('UNPAID','PAID','REFUNDED','FAILED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_order_status_check') then
    alter table public.orders add constraint orders_order_status_check
      check (order_status in ('PENDING','PROCESSING','DONE','CANCELLED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_fulfillment_status_check') then
    alter table public.orders add constraint orders_fulfillment_status_check
      check (fulfillment_status in ('PENDING','SERVED','CLOSED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_check') then
    alter table public.orders add constraint orders_payment_method_check
      check (payment_method in ('ONLINE','CASH'));
  end if;
end $$;

create index if not exists idx_orders_kitchen_released on public.orders(kitchen_released, order_status);
create index if not exists idx_orders_payment_status   on public.orders(payment_status);

-- ----------------------------------------------------------------------------
-- 2. BACKFILL LEGACY ROWS (before installing the sync trigger)
-- ----------------------------------------------------------------------------
-- Legacy mapping:
--   DONE                     -> PAID, DONE, CLOSED, released
--   PENDING / PROCESSING     -> PAID, same, PENDING, released (paid at counter)
--   UNPAID / anything else   -> UNPAID, CANCELLED, PENDING, not released

update public.orders
set payment_status     = 'PAID',
    order_status       = 'DONE',
    fulfillment_status = 'CLOSED',
    payment_method     = 'CASH',
    kitchen_released   = true
where status = 'DONE';

update public.orders
set payment_status     = 'PAID',
    order_status       = status,
    fulfillment_status = 'PENDING',
    payment_method     = 'CASH',
    kitchen_released   = true
where status in ('PENDING','PROCESSING');

update public.orders
set payment_status     = 'UNPAID',
    order_status       = 'CANCELLED',
    fulfillment_status = 'PENDING',
    payment_method     = 'CASH',
    kitchen_released   = false
where status is null or status not in ('PENDING','PROCESSING','DONE');

-- ----------------------------------------------------------------------------
-- 3. LEGACY status SYNC TRIGGER
-- ----------------------------------------------------------------------------
-- Derived rule (spec section 2):
--   ONLINE + UNPAID -> 'UNPAID'; otherwise mirror order_status.

create or replace function public.sync_legacy_order_status()
returns trigger
language plpgsql
as $$
begin
  if new.payment_method = 'ONLINE' and new.payment_status = 'UNPAID' then
    new.status := 'UNPAID';
  else
    new.status := new.order_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_sync_status on public.orders;
create trigger trg_orders_sync_status
  before insert or update on public.orders
  for each row execute function public.sync_legacy_order_status();

-- ----------------------------------------------------------------------------
-- 4. RPC: create_order (server-side price validation)
-- ----------------------------------------------------------------------------

create or replace function public.create_order(
  p_table_number text,
  p_payment_method text,
  p_lines jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id text;
  v_order_ref text;
  v_items jsonb := '[]'::jsonb;
  v_total numeric(12,2) := 0;
  v_line jsonb;
  v_item public.menu_items%rowtype;
  v_qty integer;
  v_option_ids text[];
  v_unit numeric(12,2);
  v_options jsonb;
  v_line_total numeric(12,2);
  v_opt record;
  v_group record;
  v_selected integer;
  v_required integer;
begin
  if p_payment_method not in ('ONLINE','CASH') then
    raise exception 'Metode pembayaran tidak valid: %', p_payment_method;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Pesanan kosong';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := coalesce((v_line->>'quantity')::integer, 0);
    if v_qty <= 0 then
      raise exception 'Jumlah item harus lebih dari 0';
    end if;

    begin
      select * into v_item
      from public.menu_items
      where id = (v_line->>'menu_item_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'ID menu tidak valid';
    end;

    if not found then
      raise exception 'Menu tidak ditemukan';
    end if;
    if not v_item.is_available then
      raise exception 'Menu "%" sudah habis', v_item.name;
    end if;

    -- Normalize the submitted option ids (deduplicated, text form)
    if jsonb_typeof(v_line->'option_item_ids') = 'array' then
      select coalesce(array_agg(distinct value), array[]::text[])
        into v_option_ids
      from jsonb_array_elements_text(v_line->'option_item_ids');
    else
      v_option_ids := array[]::text[];
    end if;

    -- Every submitted option must exist
    if (
      select count(distinct oi.id)
      from public.option_items oi
      where oi.id::text = any(v_option_ids)
    ) <> cardinality(v_option_ids) then
      raise exception 'Ada opsi yang tidak ditemukan';
    end if;

    -- Every submitted option must belong to a group attached to this item
    if exists (
      select 1
      from public.option_items oi
      where oi.id::text = any(v_option_ids)
        and oi.group_id not in (
          select miog.option_group_id
          from public.menu_item_option_groups miog
          where miog.menu_item_id = v_item.id
        )
    ) then
      raise exception 'Opsi tidak valid untuk menu "%"', v_item.name;
    end if;

    -- Required group / min / max validation
    for v_group in
      select og.id, og.name, og.is_required, og.min_select, og.max_select
      from public.menu_item_option_groups miog
      join public.option_groups og on og.id = miog.option_group_id
      where miog.menu_item_id = v_item.id
    loop
      select count(*) into v_selected
      from public.option_items oi
      where oi.group_id = v_group.id
        and oi.id::text = any(v_option_ids);

      v_required := case
        when v_group.is_required then greatest(coalesce(v_group.min_select, 0), 1)
        else coalesce(v_group.min_select, 0)
      end;

      if v_selected < v_required then
        raise exception 'Pilih % opsi untuk grup "%" pada menu "%"',
          v_required, v_group.name, v_item.name;
      end if;
      if v_group.max_select is not null and v_selected > v_group.max_select then
        raise exception 'Maksimal % opsi untuk grup "%" pada menu "%"',
          v_group.max_select, v_group.name, v_item.name;
      end if;
    end loop;

    -- Recompute price from the menu (source of truth)
    v_unit := v_item.base_price;
    v_options := '[]'::jsonb;

    for v_opt in
      select oi.id, oi.name, oi.price_delta, oi.is_available,
             og.id as group_id, og.name as group_name
      from public.option_items oi
      join public.option_groups og on og.id = oi.group_id
      where oi.id::text = any(v_option_ids)
      order by og.sort_order, oi.sort_order
    loop
      if not v_opt.is_available then
        raise exception 'Opsi "%" sudah habis', v_opt.name;
      end if;
      v_unit := v_unit + v_opt.price_delta;
      v_options := v_options || jsonb_build_array(jsonb_build_object(
        'group_name', v_opt.group_name,
        'option_item_id', v_opt.id,
        'option_name', v_opt.name,
        'price_delta', v_opt.price_delta
      ));
    end loop;

    v_line_total := v_unit * v_qty;
    v_total := v_total + v_line_total;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_item.id,
      'name', v_item.name,
      'base_price', v_item.base_price,
      'quantity', v_qty,
      'options', v_options,
      'unit_price', v_unit,
      'line_total', v_line_total
    ));
  end loop;

  v_order_ref := 'NGCHN-' || extract(epoch from clock_timestamp())::bigint
                 || '-' || floor(random() * 1000)::int;

  insert into public.orders (
    id_order_fintech, table_number, items, total_price, created_at,
    payment_status, order_status, fulfillment_status, payment_method,
    kitchen_released
  ) values (
    v_order_ref, p_table_number, v_items, v_total, now(),
    'UNPAID', 'PENDING', 'PENDING', p_payment_method,
    p_payment_method = 'CASH'
  )
  returning id::text into v_order_id;

  return v_order_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPCs: payment + status transitions
-- ----------------------------------------------------------------------------

-- Stub for sub-project C. Replaced by a signed gateway webhook later.
create or replace function public.mark_order_paid(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set payment_status = 'PAID',
      kitchen_released = true
  where id::text = p_order_id
    and payment_status = 'UNPAID';

  perform 1 from public.orders where id::text = p_order_id;
  if not found then
    raise exception 'Pesanan tidak ditemukan: %', p_order_id;
  end if;
end;
$$;

create or replace function public.start_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set order_status = 'PROCESSING'
  where id::text = p_order_id and order_status = 'PENDING';

  if not found then
    raise exception 'Pesanan tidak bisa mulai dimasak (status bukan PENDING)';
  end if;
end;
$$;

create or replace function public.finish_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set order_status = 'DONE'
  where id::text = p_order_id and order_status = 'PROCESSING';

  if not found then
    raise exception 'Pesanan tidak bisa diselesaikan (status bukan PROCESSING)';
  end if;
end;
$$;

create or replace function public.cancel_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set order_status = 'CANCELLED'
  where id::text = p_order_id
    and order_status in ('PENDING','PROCESSING');

  if not found then
    raise exception 'Pesanan tidak bisa dibatalkan (sudah selesai atau dibatalkan)';
  end if;
end;
$$;

create or replace function public.serve_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set fulfillment_status = 'SERVED'
  where id::text = p_order_id and fulfillment_status = 'PENDING';

  if not found then
    raise exception 'Pesanan tidak bisa ditandai tersaji (status bukan PENDING)';
  end if;
end;
$$;

create or replace function public.close_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set fulfillment_status = 'CLOSED'
  where id::text = p_order_id and fulfillment_status in ('PENDING','SERVED');

  if not found then
    raise exception 'Pesanan tidak bisa ditutup (sudah CLOSED)';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS: orders may only be created through create_order
-- ----------------------------------------------------------------------------

alter table public.orders enable row level security;

-- Drop any permissive INSERT / ALL policies so totals cannot be forged directly.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'orders' and cmd in ('INSERT','ALL')
  loop
    execute format('drop policy if exists %I on public.orders', pol.policyname);
  end loop;
end $$;

drop policy if exists orders_public_read on public.orders;
create policy orders_public_read
  on public.orders for select
  using (true);

-- ----------------------------------------------------------------------------
-- 7. EXECUTE GRANTS
-- ----------------------------------------------------------------------------

revoke all on function public.create_order(text,text,jsonb) from public;
revoke all on function public.mark_order_paid(text) from public;
revoke all on function public.start_order(text) from public;
revoke all on function public.finish_order(text) from public;
revoke all on function public.cancel_order(text) from public;
revoke all on function public.serve_order(text) from public;
revoke all on function public.close_order(text) from public;

grant execute on function public.create_order(text,text,jsonb) to anon, authenticated;
grant execute on function public.mark_order_paid(text) to anon, authenticated;
grant execute on function public.start_order(text) to authenticated;
grant execute on function public.finish_order(text) to authenticated;
grant execute on function public.cancel_order(text) to authenticated;
grant execute on function public.serve_order(text) to authenticated;
grant execute on function public.close_order(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. SANITY CHECKS (optional)
-- ----------------------------------------------------------------------------
-- select payment_status, order_status, count(*) from public.orders group by 1,2;
-- select id, payment_method, kitchen_released from public.orders order by id desc limit 5;
