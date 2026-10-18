# Implementation Plan — Payment Gateway (Midtrans Snap)

Spec: `docs/superpowers/specs/2026-10-15-payment-gateway-design.md`
Date: 2026-10-15
Depends on: sub-projects A and B

## Overview

Database function and lockdown first, then the two Edge Functions, then the
frontend, then configuration and verification. The app works in simulation mode
until Midtrans secrets are set, so the flow is testable without an account.

---

## Phase 0 — Prerequisites

1. Migrations `001` and `002` applied.
2. Supabase CLI available for deploying functions (not available in this
   sandbox — deployment is a manual step by the owner).
3. A Midtrans account (sandbox is enough) if `PAYMENT_MODE=midtrans` is desired.

---

## Phase 1 — Database

**File:** `supabase/migrations/004_payment_gateway.sql`

1. Add `payment_provider`, `payment_reference`, `payment_token`, `paid_at`,
   `payment_payload`.
2. Create `apply_payment_result(...)` SECURITY DEFINER, idempotent, service-role
   only.
3. Revoke `anon`/`authenticated` EXECUTE on `mark_order_paid`; grant to
   `service_role`.

**Verification:** existing unpaid orders unchanged; calling `mark_order_paid`
from the browser now fails with a permission error.

---

## Phase 2 — Edge Functions

**Files:**
- `supabase/functions/payment-create/index.ts`
- `supabase/functions/payment-webhook/index.ts`

**Steps:**

1. Implement `payment-create` per spec section 4.
2. Implement `payment-webhook` per spec section 4, including the SHA-512
   signature check, constant-time comparison, and amount verification.
3. Document deployment in `supabase/functions/README.md`.

**Deployment (manual):**
```bash
supabase functions deploy payment-create
supabase functions deploy payment-webhook --no-verify-jwt
supabase secrets set MIDTRANS_SERVER_KEY=... MIDTRANS_IS_PRODUCTION=false \
  PAYMENT_MODE=simulation APP_BASE_URL=https://your-app.example.com
```

**Verification:** in simulation mode `payment-create` marks an online order paid.

---

## Phase 3 — Frontend

**Files:**
- `src/lib/paymentApi.js` (new)
- `src/components/PaymentResultView.jsx` (new)
- `src/App.jsx` (edit: online flow, `payment-result` route)

**Steps:**

1. Online checkout calls `createPayment(orderId)` instead of `markOrderPaid`.
2. If `redirect_url` is returned, navigate to Midtrans; otherwise show the
   simulated result.
3. Add `?page=payment-result&order=<id>` rendering `PaymentResultView`, which
   polls for a short window and shows paid / failed / pending.
4. Clear the cart only after the function responds successfully.

**Verification:** simulation mode completes an online order end to end; the
kitchen receives it only after payment is applied.

---

## Phase 4 — Verification

1. `npm run lint` and `npm run build`.
2. Manual test plan from spec section 9.
3. Optional sandbox test against Midtrans with a real sandbox key.

---

## Risks and Notes

- Edge Functions cannot be deployed from this environment; the owner must deploy.
- `PAYMENT_MODE` defaults to `simulation` so a missing Midtrans key never
  silently marks orders paid in production.
- The webhook must be reachable publicly and is intentionally deployed without
  JWT verification; the signature is the only gate.
- Amounts are rounded to whole rupiah for Midtrans; `total_price` is numeric(12,2)
  but menu prices are integers, so no rounding loss is expected.
