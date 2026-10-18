# Staff, Roles & Tables — Design Spec

Date: 2026-10-15
Project: Ngachoan QR-Order (React + Vite + Tailwind + Supabase)
Sub-project: D — Staff, Roles & Tables
Depends on: A (menu, staff table), B (order lifecycle)

## 1. Context and Goal

Access control is still hardcoded to two email strings in `App.jsx`
(`dapur@ngachoan.com`, `owner@ngachoan.com`), sessions do not survive a page
refresh, staff accounts can only be made by hand in the Supabase dashboard, and
dining tables/QR codes are not managed anywhere in the app.

### Goal

Replace hardcoded email checks with database-backed roles, persist login
sessions, let the owner create and manage staff accounts (owner / manager /
kitchen) from the app, and let the owner manage dining tables and download their
QR codes.

## 2. Data Model

### staff (extends the table from sub-project A)

| column | type | notes |
|---|---|---|
| display_name | text | shown in the UI |
| is_active | boolean not null default true | inactive staff lose access |
| updated_at | timestamptz | |

### restaurant_tables (new)

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| label | text unique not null | e.g. `MEJA-01`, used in `?meja=` |
| zone | text | e.g. Indoor / Outdoor |
| sort_order | int | |
| is_active | boolean | inactive tables are hidden from the QR list |
| created_at | timestamptz | |

Seeded with `MEJA-01..06` only when the table is empty.

## 3. Roles and Access

| Page | Route | Allowed roles |
|---|---|---|
| Customer | `/` | public |
| Kitchen | `?page=dapur` | kitchen, owner, manager |
| Owner dashboard | `?page=owner` | owner |
| Menu admin | `?page=menu` | owner, manager |
| Staff & tables | `?page=staff` | owner |

Rules are enforced twice: in the UI (`App.jsx`) and in Postgres (RLS +
`is_manager()` / `is_kitchen_staff()`), so hiding a URL is never the only guard.
Inactive staff (`is_active = false`) are treated as having no role.

## 4. Session Persistence

On mount, `App.jsx` calls `supabase.auth.getSession()` and subscribes to
`onAuthStateChange`. A refresh keeps staff logged in; signing out clears the
session and returns to the login screen.

## 5. Staff Administration

Account creation needs the Supabase service role, which must never reach the
browser, so it is behind an Edge Function.

### Edge Function `staff-admin` (JWT required)

Verifies the caller's JWT, then requires the caller to be an **active owner**.
Actions:

- `list` — all staff rows (id, email, role, display name, active).
- `create` — creates the auth user (email confirmed) and the matching `staff`
  row; rolls the auth user back if the staff insert fails.
- `updateRole` — owner, manager, kitchen. An owner cannot demote themselves.
- `setActive` — an owner cannot deactivate themselves.

Clients never receive the service role key.

## 6. Tables and QR Codes

`?page=staff` has two tabs: **Staf** and **Meja & QR**.

- Create, reorder, activate/deactivate, and delete tables.
- Each table renders a QR code encoding `https://<app>/?meja=<label>`.
- QR images are generated in the browser with the `qrcode` package (no network
  dependency) and can be downloaded as PNG.

Deleting a table does not delete historical orders — `orders.table_number` is a
text snapshot, so past orders remain readable.

## 7. Security

- RLS: `restaurant_tables` is publicly readable (the customer app needs the
  label only via URL) and manager-writable.
- `staff` is readable by the current user and by managers; writes stay closed to
  clients and go through `staff-admin`.
- `is_active` is respected by both `fetchMyStaff()` and the `staff-admin`
  checks, so deactivation takes effect on the next page load.
- Passwords are set by the owner when creating an account; no plaintext storage
  outside Supabase Auth.

## 8. Error Handling and Edge Cases

- Duplicate email → clear error from Supabase Auth surfaced in the form.
- Failed staff insert after auth creation → auth user is deleted (no orphans).
- Missing migration 005 → `fetchMyStaff` falls back to the query without
  `is_active` so the app keeps working during a staged rollout.
- Deleting/deactivating a table never affects existing orders.
- A signed-in user with no `staff` row is denied all staff pages.

## 9. Testing

- `npm run lint` and `npm run build`.
- Owner can create a kitchen account; that account can open `?page=dapur` and
  cannot open `?page=owner`, `?page=menu`, or `?page=staff`.
- Manager can open `?page=menu` but not `?page=staff`.
- Deactivating a staff member blocks access on their next load.
- Refresh keeps the session; sign-out returns to login.
- Tables can be created, reordered, and their QR downloads and opens the correct
  table on the customer page.

## 10. Out of Scope

- Historical/date-range reporting and exports (E)
- Key/env hardening and broader RLS review (F)
- Password reset / self-service account recovery
- Per-table assignment of waiters or table-specific menus
