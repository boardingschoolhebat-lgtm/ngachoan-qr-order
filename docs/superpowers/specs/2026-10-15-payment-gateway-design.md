# Payment Gateway (Midtrans Snap) — Design Spec

Date: 2026-10-15
Project: Ngachoan QR-Order (React + Vite + Tailwind + Supabase)
Sub-project: C — Online Payment Gateway
Depends on: A (menu), B (order/payment lifecycle)

## 1. Context and Goal

Sub-project B separated payment state from kitchen state and left online payment
as a client-triggered stub (`mark_order_paid`). That stub is callable from the
browser, so it cannot be trusted for real money. This sub-project replaces it
with a real gateway integration: a server-side transaction is created with
Midtrans Snap, the customer pays on Midtrans, and a signed webhook marks the
order paid and releases it to the kitchen.

### Goal

Customers can pay online (QRIS / VA / e-wallet) through Midtrans Snap; the order
becomes `payment_status = PAID` and `kitchen_released = true` only when Midtrans
confirms with a valid signature; the browser can no longer mark anything paid.

## 2. Architecture

```
Customer (browser)
  -> create_order (Postgres RPC, sub-project B)   => order UNPAID
  -> payment-create (Edge Function)               => Snap transaction
       -> Midtrans Snap API                       => redirect_url
Customer pays on Midtrans
Midtrans
  -> payment-webhook (Edge Function, no JWT)      => verify SHA512 signature
       -> apply_payment_result (RPC, service role)=> PAID + kitchen_released
Customer returns to ?page=payment-result&order=<id>
  -> polls orders.payment_status
```

The Midtrans server key never leaves the Edge Function environment.

## 3. Data Model Changes

`orders` gains:

| column | type | purpose |
|---|---|---|
| payment_provider | text | `MIDTRANS` / `SIMULATION` |
| payment_reference | text | Snap token / transaction id |
| payment_token | text | Snap token for re-opening the payment page |
| paid_at | timestamptz | when payment was confirmed |
| payment_payload | jsonb | last gateway notification (audit) |

`id_order_fintech` (already present from sub-project B) is used as the Midtrans
`order_id`.

## 4. Edge Functions

### payment-create (JWT required)

1. Accepts `{ orderId }` (our `orders.id`).
2. Loads the order with the service role. Rejects missing orders, already-paid
   orders, and orders whose `payment_method != 'ONLINE'`.
3. `PAYMENT_MODE=simulation` (default): calls `apply_payment_result` with PAID and
   returns `{ paid: true }`. Still server-side, so the client cannot forge it.
4. `PAYMENT_MODE=midtrans`: creates a Snap transaction with
   `order_id = id_order_fintech`, `gross_amount = round(total_price)`, and a
   finish URL of `APP_BASE_URL/?page=payment-result&order=<id>`.
5. Stores `payment_provider`, `payment_token`, `payment_reference` and returns
   `{ redirect_url, token }`.

### payment-webhook (deployed with `--no-verify-jwt`)

1. Reads the Midtrans notification.
2. Computes `SHA512(order_id + status_code + gross_amount + serverKey)` and
   compares it to `signature_key` with a constant-time comparison.
3. Looks up the order by `id_order_fintech` and verifies the notified
   `gross_amount` equals our `total_price`.
4. Normalizes status:
   - `settlement` → PAID
   - `capture` + `fraud_status=accept` → PAID, otherwise PENDING
   - `deny` / `cancel` / `expire` / `failure` → FAILED
   - anything else → PENDING
5. Calls `apply_payment_result` (service role only).

## 5. Database Function

`apply_payment_result(p_order_ref, p_status, p_provider, p_reference, p_payload)`
is SECURITY DEFINER and granted only to `service_role`:

- Idempotent: if the order is already PAID it returns immediately, so repeated
  notifications are harmless and never downgrade a paid order.
- PAID sets `payment_status`, `kitchen_released = true`, and `paid_at`.
- FAILED sets `payment_status = 'FAILED'` and keeps the order out of the kitchen.
- Always records provider, reference, and the raw payload for audit.

## 6. Security

- `mark_order_paid` has its `anon`/`authenticated` grants revoked; only the
  service role can call it (kept for internal/simulation use).
- `apply_payment_result` is service-role only.
- Webhook authenticity is proven by the signature; it is deployed without JWT
  verification because Midtrans cannot supply a Supabase JWT.
- Amount is re-checked against our own record, so a tampered notification cannot
  pay a different amount.
- Server key lives only in Edge Function secrets.

## 7. Frontend

- `src/lib/paymentApi.js`: `createPayment(orderId)`, `fetchOrderPaymentStatus(id)`.
- Customer: online orders call `createPayment`; if a `redirect_url` is returned the
  browser navigates to Midtrans; in simulation mode the order is already paid.
- `PaymentResultView` (`?page=payment-result&order=<id>`): polls the order for a
  short window and shows paid / failed / pending with a link back to the menu.

## 8. Error Handling and Edge Cases

- Function not configured (missing secrets) → clear error surfaced to the user,
  order stays UNPAID and does not reach the kitchen.
- Duplicate or out-of-order webhooks → idempotent, no state regression.
- Invalid signature → 401, nothing changes.
- Amount mismatch → 409, nothing changes.
- Customer abandons payment → order stays UNPAID; it can be cancelled by staff.
- Refunds remain manual in this sub-project.

## 9. Testing

- `npm run lint` and `npm run build` pass.
- Simulation mode: online order becomes PAID and appears in the kitchen.
- Webhook signature and amount checks verified with crafted payloads.
- Idempotency: replaying a settled notification does not change state.
- Browser cannot call `mark_order_paid` (permission denied).

## 10. Out of Scope

- Refund automation and reconciliation reports (E)
- Staff/cashier UI, table & QR management (D)
- Moving the Supabase anon key to env and broader RLS hardening (F)
