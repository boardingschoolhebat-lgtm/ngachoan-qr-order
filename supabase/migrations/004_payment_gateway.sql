-- ============================================================================
-- Ngachoan — Payment gateway migration (sub-project C)
-- Spec: docs/superpowers/specs/2026-10-15-payment-gateway-design.md
--
-- Run AFTER 001 and 002.
--
-- What this does:
--   * Adds payment tracking columns to orders.
--   * Adds apply_payment_result(), the single idempotent entry point used by
--     the Midtrans webhook Edge Function (service role only).
--   * Revokes the anon/authenticated grant on mark_order_paid() so the client
--     stub can no longer be called from the browser.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NEW COLUMNS
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_token text,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_payload jsonb;

create index if not exists idx_orders_payment_reference on public.orders(payment_reference);
create index if not exists idx_orders_id_order_fintech   on public.orders(id_order_fintech);

-- ----------------------------------------------------------------------------
-- 2. apply_payment_result(): idempotent, service-role only
-- ----------------------------------------------------------------------------
-- Called by the webhook Edge Function after the signature is verified.
-- p_status is the normalized result: 'PAID' | 'FAILED' | 'PENDING'.

create or replace function public.apply_payment_result(
  p_order_ref text,
  p_status text,
  p_provider text,
  p_reference text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_current text;
begin
  if p_status not in ('PAID','FAILED','PENDING') then
    raise exception 'Status pembayaran tidak dikenal: %', p_status;
  end if;

  select id::text, payment_status
    into v_id, v_current
  from public.orders
  where id_order_fintech = p_order_ref;

  if not found then
    raise exception 'Pesanan tidak ditemukan untuk referensi %', p_order_ref;
  end if;

  -- Idempotent: never downgrade a PAID order.
  if v_current = 'PAID' then
    return v_id;
  end if;

  if p_status = 'PAID' then
    update public.orders
    set payment_status     = 'PAID',
        kitchen_released   = true,
        paid_at            = now(),
        payment_provider   = coalesce(p_provider, payment_provider),
        payment_reference  = coalesce(p_reference, payment_reference),
        payment_payload    = p_payload
    where id::text = v_id;
  elsif p_status = 'FAILED' then
    update public.orders
    set payment_status    = 'FAILED',
        payment_provider  = coalesce(p_provider, payment_provider),
        payment_reference = coalesce(p_reference, payment_reference),
        payment_payload   = p_payload
    where id::text = v_id;
  else
    update public.orders
    set payment_provider  = coalesce(p_provider, payment_provider),
        payment_reference = coalesce(p_reference, payment_reference),
        payment_payload   = p_payload
    where id::text = v_id;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. LOCK DOWN THE STUB
-- ----------------------------------------------------------------------------
-- mark_order_paid() was the sub-project B simulation. The browser must no
-- longer be able to mark an order paid directly.

revoke all on function public.mark_order_paid(text) from anon, authenticated;
grant execute on function public.mark_order_paid(text) to service_role;

revoke all on function public.apply_payment_result(text,text,text,text,jsonb) from public;
revoke all on function public.apply_payment_result(text,text,text,text,jsonb) from anon, authenticated;
grant execute on function public.apply_payment_result(text,text,text,text,jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 4. SANITY CHECKS (optional)
-- ----------------------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_name='orders' and column_name like 'payment%';
