-- ============================================================================
-- Ngachoan — Drop legacy orders.status (sub-project B, phase 5)
--
-- IMPORTANT: Apply ONLY after the new frontend (which reads payment_status /
-- order_status / fulfillment_status) is deployed. Any old client still reading
-- orders.status will break once this runs.
-- ============================================================================

drop trigger if exists trg_orders_sync_status on public.orders;
drop function if exists public.sync_legacy_order_status();

alter table public.orders drop column if exists status;

-- Optional sanity check:
-- select id, payment_status, order_status, fulfillment_status from public.orders limit 5;
