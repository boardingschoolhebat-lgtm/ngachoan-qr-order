# Implementation Plan — Staff, Roles & Tables

Spec: `docs/superpowers/specs/2026-10-15-staff-roles-tables-design.md`
Date: 2026-10-15
Depends on: sub-project A (staff table, is_manager)

## Overview

Migration → Edge Function → client APIs → UI → App guards. The app keeps working
during a staged rollout because the staff lookup tolerates a missing `is_active`
column.

---

## Phase 1 — Database

**File:** `supabase/migrations/005_staff_and_tables.sql`

1. Extend `staff` with `display_name`, `is_active`, `updated_at`.
2. Create `restaurant_tables` with RLS (public read, manager write).
3. Seed `MEJA-01..06` only when the table is empty.
4. Add `staff_read_manager` policy so managers can list staff.
5. Add `my_staff_role()` and `is_kitchen_staff()` helpers.

**Verification:** tables listed; `is_active` present on `staff`; anon can select
tables but not insert.

---

## Phase 2 — Edge Function

**File:** `supabase/functions/staff-admin/index.ts`

1. Verify the caller JWT and require an active owner.
2. Implement `list`, `create`, `updateRole`, `setActive` per spec section 5.
3. Roll back the auth user if the staff row insert fails.

**Deployment (manual):**
```bash
supabase functions deploy staff-admin
```

**Verification:** a kitchen account cannot call it (403); an owner can create a
staff account and list it.

---

## Phase 3 — Client APIs

**Files:**
- `src/lib/staffApi.js` — invoke `staff-admin`.
- `src/lib/tableApi.js` — CRUD for `restaurant_tables`, `tableOrderUrl()`.
- `src/lib/menuApi.js` — `fetchMyStaff()` filters `is_active`, with a fallback
  when the column is missing.

**Verification:** `npm run lint`.

---

## Phase 4 — UI

**Files:**
- `src/components/StaffView.jsx` (`?page=staff`, owner only)
- `src/components/admin/StaffPanel.jsx`
- `src/components/admin/TablesPanel.jsx`
- `src/components/MenuAdminView.jsx` (link to Staff & Meja)
- `package.json` (`qrcode` dependency)

**Steps:**

1. Staff tab: create account form, role selector, active toggle.
2. Tables tab: create/reorder/activate/delete, QR preview, PNG download.
3. Cross-links between the menu admin and staff pages, plus sign-out.

**Verification:** QR encodes the correct `?meja=` URL; role changes persist.

---

## Phase 5 — App guards and session

**File:** `src/App.jsx`

1. Restore the session with `getSession()` and follow `onAuthStateChange`.
2. Replace hardcoded email checks with role checks:
   - kitchen: `kitchen | owner | manager`
   - owner dashboard: `owner`
   - menu admin: `owner | manager`
   - staff page: `owner`
3. Add the `?page=staff` route and a shared "Memeriksa hak akses..." state.

**Verification:** refresh keeps the session; each role sees only its pages.

---

## Phase 6 — Verification

1. `npm run lint` and `npm run build`.
2. Manual plan from spec section 9.
3. Smoke-test customer, kitchen, owner, menu, and staff pages in the preview.

---

## Risks and Notes

- `staff-admin` must be deployed for account creation; the rest of the app works
  without it.
- Existing staff rows created by migration 001 have no `display_name`; the UI
  falls back to email.
- If migration 005 is delayed, role guards still work but deactivated staff
  remain active until the column exists.
- Deleting a table never touches historical orders (text snapshot).
