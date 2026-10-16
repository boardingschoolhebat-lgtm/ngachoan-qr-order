# Order & Payment Lifecycle — Design Spec

Date: 2026-10-15
Project: Ngachoan QR-Order (React + Vite + Tailwind + Supabase)
Sub-project: B — Order & Payment Lifecycle

## 1. Context and Goal

Orders currently use a single mixed `orders.status` column that walks
`UNPAID → PENDING → PROCESSING → DONE`. Payment and kitchen progress are
different concerns: a cash order is unpaid but must be cooked immediately, while
an online order must be paid before it reaches the kitchen. Prices are computed
in the browser and trusted by the server, so a client can write any total.

### Goal

Separate payment, kitchen, and fulfillment state into three independent columns;
release orders to the kitchen according to payment method; and validate prices
server-side so order totals are computed from the menu, not the browser.

### Roadmap position

Sub-project B of the "go-live for a single restaurant" effort. Depends on A
(dynamic menu, now complete). Prerequisites for C.

Deferred sub-projects: **C** payment gateway, **D** staff/roles/tables,
**E** reporting/close-out, **F** security/keys.

## 2. Status Model (three columns)

`orders` gains three new columns. The legacy `status` column is kept temporarily
as a derived value so older views keep working, then removed at the end of this
sub-project. Derivation during the transition: `status = 'UNPAID'` when
`payment_method = ONLINE and payment_status = UNPAID`; otherwise `status` mirrors
`order_status` (i.e. `PENDING` / `PROCESSING` / `DONE` / `CANCELLED`). This keeps
the old mixed-value contract coherent for any reader that still expects it.

| column | values | default | meaning |
|---|---|---|---|
| payment_status | UNPAID, PAID, REFUNDED, FAILED | UNPAID | money state |
| order_status | PENDING, PROCESSING, DONE, CANCELLED | PENDING | kitchen state |
| fulfillment_status | PENDING, SERVED, CLOSED | PENDING | serving state |
| payment_method | ONLINE, CASH | CASH | how the customer pays |
| kitchen_released | boolean | false | may the kitchen see it |

### Transition rules

- payment_status: `UNPAID → PAID → REFUNDED`; `UNPAID → FAILED`.
- order_status: `PENDING → PROCESSING → DONE`; `PENDING/PROCESSING → CANCELLED`.
  `DONE` is terminal; illegal transitions are rejected server-side.
- fulfillment_status: `PENDING → SERVED → CLOSED`.
- Cancelling requires `order_status != DONE`.

## 3. Kitchen Gate Rules

- **CASH:** `kitchen_released = true` immediately. The order shows in the kitchen
  even while `payment_status = UNPAID`.
- **ONLINE:** `kitchen_released = false` until `payment_status = PAID`; setting it
  to PAID flips `kitchen_released = true`.
- `DapurView` filters on `kitchen_released = true` (instead of the old
  `status in (PENDING, PROCESSING)`).

## 4. Server-Side Price Validation — RPC `create_order`

The client sends only `table_number`, `payment_method`, and an array of
`{ menu_item_id, quantity, option_item_ids[] }`. A Postgres function
`create_order(...)` (SECURITY DEFINER):

1. Loads item base prices and option price deltas from the menu tables
   (source of truth).
2. Recomputes `unit_price = base_price + Σ price_delta`, `line_total`, and
   `total_price`.
3. Rejects any item or option with `is_available = false`.
4. Validates required option groups are satisfied for each line.
5. Inserts the order with the `items` snapshot (same shape as sub-project A) and
   the three status columns, setting `kitchen_released` by `payment_method`.
6. Returns the new order id.

`anon` may call `create_order`; the direct anonymous INSERT on `orders` used
today is removed/guarded so totals cannot be forged.

## 5. Status Transition Actions

- **Simulate online payment (stub for C):** an RPC `mark_order_paid(order_id)`
  sets `payment_status = PAID` and `kitchen_released = true`. Idempotent — a
  second call is a no-op. In sub-project C this is replaced by a signed gateway
  webhook.
- **Kitchen:** start cooking (`order_status → PROCESSING`), finish (`→ DONE`).
- **Waiter/cashier:** `fulfillment_status → SERVED → CLOSED`.
- **Cancel:** `order_status → CANCELLED` (only if not `DONE`); refunds are marked
  manually in B.

All transitions run through RPCs that enforce the legal-transition rules.

## 6. UI Impact

### Customer (`App.jsx`)

- Choose payment method (online / cash) in the review modal.
- Copy differs per method: online tells the user the order reaches the kitchen
  after payment; cash tells them it goes straight to the kitchen and is paid at
  the counter.
- Online flow calls a stub "simulate payment" action instead of the current
  alert chain.

### Kitchen (`DapurView.jsx`)

- Filter `kitchen_released = true`.
- Drive card actions via `order_status` transitions.
- Show a payment-method badge (ONLINE/CASH) and a paid/unpaid hint.

### Owner (`OwnerView.jsx`)

- Revenue counts only `payment_status = PAID` orders.
- Add a KPI for "belum terbayar" (unpaid) and a breakdown by payment method.
- Keep best-seller aggregation keyed by item name.

## 7. Error Handling and Edge Cases

- RPCs reject with clear messages: item sold out, invalid option, required option
  missing, or illegal transition.
- Orders with `payment_status = FAILED` are retained for audit and never
  released to the kitchen.
- `mark_order_paid` is idempotent; it never duplicates an order.
- Concurrency: transitions are guarded in SQL so two devices cannot move an
  order through an illegal path.
- Legacy rows (pre-B) are backfilled: `payment_status = PAID` when old
  `status = DONE`, `kitchen_released = true` when old `status in
  (PENDING, PROCESSING, DONE)`, `payment_method = CASH`.

## 8. Testing

- `npm run lint` and `npm run build` must pass.
- Manual test plan: cash order reaches the kitchen while unpaid; online order
  waits for payment then appears; forged prices are rejected by `create_order`;
  illegal transitions are rejected; owner revenue counts only PAID orders;
  legacy rows render in kitchen and owner views.

## 9. Out of Scope

- Real payment gateway, signed webhooks, reconciliation (C)
- Full staff/cashier UI, table & QR management (D)
- Historical/date-range reporting, daily closing, export (E)
- Moving keys to env and broader RLS hardening (F)
