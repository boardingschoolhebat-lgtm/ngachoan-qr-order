# Implementation Plan — Order & Payment Lifecycle

Spec: `docs/superpowers/specs/2026-10-15-order-payment-lifecycle-design.md`
Date: 2026-10-15
Depends on: sub-project A (menu management)

## Overview

Five phases building on the existing menu model. Phase 1 is the database
foundation (columns, backfill, RPCs); phases 2–4 wire the views; phase 5 removes
the legacy `status` column and verifies.

Execution order matters: RPCs and columns before any view change.

---

## Phase 0 — Prerequisite Check

1. Confirm sub-project A migration (`001_menu_management.sql`) has been applied.
2. Confirm `orders` currently has: `id`, `id_order_fintech`, `table_number`,
   `items` (jsonb), `total_price`, `status`, `created_at`.

**Verification:** `select column_name from information_schema.columns where
table_name='orders';` lists the columns above.

---

## Phase 1 — Database: columns, backfill, RPCs

**Deliverable:** `supabase/migrations/002_order_payment_lifecycle.sql`.

**Steps:**

1. Add columns to `orders`:
   - `payment_status text not null default 'UNPAID'` check in
     `('UNPAID','PAID','REFUNDED','FAILED')`
   - `order_status text not null default 'PENDING'` check in
     `('PENDING','PROCESSING','DONE','CANCELLED')`
   - `fulfillment_status text not null default 'PENDING'` check in
     `('PENDING','SERVED','CLOSED')`
   - `payment_method text not null default 'CASH'` check in `('ONLINE','CASH')`
   - `kitchen_released boolean not null default false`
2. Backfill legacy rows per spec section 7:
   `payment_status = 'PAID'` when `status = 'DONE'`;
   `kitchen_released = true` when `status in ('PENDING','PROCESSING','DONE')`;
   `payment_method = 'CASH'`; mirror `order_status` from `status` where possible.
3. Create `public.set_order_status_on_legacy()` trigger (or equivalent) that keeps
   the legacy `status` column derived per spec section 2 while it still exists.
4. Create `create_order(p_table_number text, p_payment_method text,
   p_lines jsonb)` as SECURITY DEFINER:
   - recompute prices from `menu_items` + `option_items`;
   - reject unavailable items/options and unmet required groups;
   - insert the order with the `items` snapshot and status columns;
   - set `kitchen_released = (p_payment_method = 'CASH')`;
   - return the new order id.
5. Create `mark_order_paid(p_order_id bigint)` SECURITY DEFINER: idempotent,
   sets `payment_status='PAID'` and `kitchen_released=true`.
6. Create transition RPCs: `start_order`, `finish_order`, `serve_order`,
   `close_order`, `cancel_order`, each enforcing legal transitions.
7. RLS on `orders`: keep public SELECT (kitchen/owner read), remove the anonymous
   INSERT policy so orders can only be created via `create_order`; grant EXECUTE
   on `create_order`/`mark_order_paid` to `anon`, the rest to authenticated.

**Verification:**
- Migration runs with no errors.
- `create_order` with a forged `total_price` argument (ignored) returns a
  server-computed total.
- `create_order` with an unavailable item raises an exception.
- Calling `mark_order_paid` twice changes nothing the second time.

---

## Phase 2 — Data layer

**Deliverable:** `src/lib/orderApi.js`.

**Steps:**

1. `createOrder({ tableNumber, paymentMethod, lines })` → calls the
   `create_order` RPC, returns the order id. `lines` are
   `{ menu_item_id, quantity, option_item_ids: [] }`.
2. `markOrderPaid(orderId)`, `startOrder`, `finishOrder`, `serveOrder`,
   `closeOrder`, `cancelOrder` → call their RPCs.
3. Normalize Supabase/Postgres errors into readable `Error` messages.

**Verification:** `npm run lint` passes; a console call to `createOrder` works
against seeded data.

---

## Phase 3 — Customer view

**Deliverable:** `App.jsx` submits via RPC and offers a payment-method choice.

**Files:** `src/App.jsx`, `src/components/OptionSelectModal.jsx` (unchanged),
possibly a small `PaymentMethodStep` inline in the review modal.

**Steps:**

1. Add a payment-method selector (Online / Bayar di Kasir) to the review modal,
   defaulting to Cash.
2. Replace the direct `orders` insert with `createOrder` from `orderApi.js`,
   sending only item ids, quantities, and option ids.
3. Build `lines` from the cart signature lines (group option ids per line).
4. Online flow: after `createOrder`, call `markOrderPaid` as the stub for the
   gateway, then show the "paid → sent to kitchen" message.
5. Cash flow: show "sent to kitchen, pay at the counter" and skip payment.
6. Surface RPC rejection messages (sold out, invalid option) inline.
7. On success clear the cart as today.

**Verification:**
- Cash order: appears in the kitchen without paying.
- Online order: does not appear until `markOrderPaid` runs, then appears.
- Forging prices is impossible from the client.

---

## Phase 4 — Kitchen and owner views

**Files:** `src/components/DapurView.jsx`, `src/components/OwnerView.jsx`.

**Steps:**

1. Kitchen: fetch orders where `kitchen_released = true` and
   `order_status in ('PENDING','PROCESSING')`. Realtime subscription listens for
   `kitchen_released` becoming true.
2. Kitchen actions call `startOrder` / `finishOrder` (and optionally `serveOrder`).
3. Kitchen card shows a payment-method badge and a paid/unpaid hint.
4. Owner: revenue counts only `payment_status = 'PAID'` orders.
5. Owner: add a "Belum Terbayar" KPI and a breakdown by payment method.
6. Owner: harden against rows missing the new columns (defensive defaults).

**Verification:**
- `startOrder`/`finishOrder` move an order through kitchen states.
- Online unpaid order never shows in the kitchen; after payment it does.
- Owner revenue excludes unpaid orders; method breakdown is correct.

---

## Phase 5 — Remove legacy status and verify

**Files:** `supabase/migrations/003_drop_legacy_status.sql`.

**Steps:**

1. Confirm no code reads `orders.status` (grep `src/`).
2. Drop the legacy-derived trigger and the `status` column.
3. Run `npm run lint` and `npm run build`.
4. Execute the manual test plan from spec section 8; smoke-test all three views
   via the local preview.

**Verification:**
- `grep -rn "order.status\|\.status ===" src/` shows only the new columns.
- Lint and build pass; manual test plan passes.

---

## Risks and Notes

- The legacy `status` derivation must be correct before removing the column, or
  any still-deployed old client breaks. Prefer deploying the new frontend before
  phase 5.
- Direct anon INSERT on `orders` must be removed, otherwise `create_order`'s
  price validation is bypassable.
- RLS policies for `orders` currently (from before A) may be permissive; audit
  them in phase 1 rather than assuming.
- Auth users and staff roles are prerequisites for the authenticated transition
  RPCs.
