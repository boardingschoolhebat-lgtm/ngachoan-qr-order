# Supabase Edge Functions

Two functions power online payments:

| Function | JWT | Purpose |
|---|---|---|
| `payment-create` | required | Creates a Midtrans Snap transaction (or simulates payment) |
| `payment-webhook` | **disabled** | Receives and verifies Midtrans notifications |

## Deploy

```bash
supabase functions deploy payment-create
supabase functions deploy payment-webhook --no-verify-jwt
```

`payment-webhook` must be deployed without JWT verification because Midtrans
cannot send a Supabase JWT. Authenticity is enforced by the Midtrans signature.

## Secrets

```bash
supabase secrets set \
  MIDTRANS_SERVER_KEY=your-server-key \
  MIDTRANS_IS_PRODUCTION=false \
  PAYMENT_MODE=simulation \
  APP_BASE_URL=https://your-app.example.com
```

| Secret | Values | Notes |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | string | Never expose to the browser |
| `MIDTRANS_IS_PRODUCTION` | `true` / `false` | Default `false` (sandbox) |
| `PAYMENT_MODE` | `simulation` / `midtrans` | Default `simulation` |
| `APP_BASE_URL` | URL | Used for the finish redirect and CORS |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
Supabase runtime. Do not add them manually.

## Payment modes

- **simulation** — `payment-create` marks the order paid server-side and returns
  `{ paid: true }`. No Midtrans account required. Safe for demos and local QA.
- **midtrans** — creates a real Snap transaction and returns `{ redirect_url }`.
  The order is only marked paid when the verified webhook arrives.

## Midtrans configuration

In the Midtrans dashboard set the Payment Notification URL to:

```
https://<project-ref>.supabase.co/functions/v1/payment-webhook
```

## Verifying the webhook

`payment-webhook` checks:

1. The SHA-512 signature
   `sha512(order_id + status_code + gross_amount + server_key)`.
2. That `gross_amount` equals the order's `total_price` in the database.
3. Idempotency through `apply_payment_result`, so replayed notifications are
   harmless.

Invalid signatures return `401`; amount mismatches return `409`.
