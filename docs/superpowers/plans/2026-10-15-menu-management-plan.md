# Implementation Plan — Menu Management (Dynamic Menu + Variants)

Spec: `docs/superpowers/specs/2026-10-15-menu-management-design.md`
Date: 2026-10-15

## Overview

Six phases, each independently verifiable. Phases 0–1 build the foundation
(database + data layer); phases 2–4 wire the three views; phase 5 removes the
old static menu; phase 6 verifies end to end.

Execution order matters: the database must exist before the data layer, and the
data layer before any view.

---

## Phase 0 — Database, RLS, Storage, Seed

**Deliverable:** a SQL migration the owner runs once in the Supabase SQL editor.

**Files:**
- `supabase/migrations/001_menu_management.sql` (new)

**Steps:**

1. Create tables per spec section 3: `categories`, `menu_items`,
   `option_groups`, `option_items`, `menu_item_option_groups`, `staff`.
   Include the check constraints (`selection_type in ('single','multiple')`,
   `role in ('owner','manager','kitchen')`, `base_price >= 0`), foreign keys,
   and defaults.
2. Add an `updated_at` trigger on `menu_items`.
3. Create `is_manager()` as `SECURITY DEFINER`, returning whether the current
   `auth.uid()` has role `owner` or `manager` in `staff`.
4. Enable RLS on every menu table. Add public SELECT policies and
   `is_manager()`-guarded write policies per spec section 4.
5. Add the `staff` self-read policy.
6. Create the `menu-images` Storage bucket (public read) and its write policy.
7. Seed data:
   - Categories: `Mie`, `Dimsum`, `Minuman` with `sort_order` 1, 2, 3.
   - The 6 existing items from `src/data/menuData.js`, mapped to categories,
     preserving names, descriptions, prices, and image URLs.
   - One reusable single-select group `Level Pedas` with options `Level 1-4`
     (delta 0) and `Level 5-8` (delta +1500), attached to the two Mie items.
   - `staff` rows: `owner@ngachoan.com` (owner), `dapur@ngachoan.com`
     (kitchen).
8. Confirm the Supabase auth users for those emails exist (document as a
   prerequisite if not).

**Verification:**
- Run the migration in the Supabase SQL editor with no errors.
- `select * from categories;` returns 3 rows.
- `select count(*) from menu_items;` returns 6.
- With the anon key, `select` on `menu_items` succeeds; an `insert` fails.

---

## Phase 1 — Data Access Layer

**Deliverable:** one module the views use for all menu reads, writes, uploads,
and realtime.

**Files:**
- `src/lib/menuApi.js` (new)

**Steps:**

1. Read functions: `fetchCategories()`, `fetchMenuTree()` (items + attached
   groups + options in one call), returning a normalized structure.
2. Admin write functions: category, item, option-group, and option-item CRUD;
   `attachOptionGroup(itemId, groupId)`, `detachOptionGroup(itemId, groupId)`;
   `setItemAvailability(id, bool)`.
3. `uploadMenuImage(file)` — validate MIME type and size, then write to the
   `menu-images` bucket and return the public URL.
4. `subscribeToMenu(onChange)` — a realtime channel over the menu tables that
   calls `onChange`; returns an unsubscribe handle.
5. Normalize all Supabase errors into thrown `Error` objects with readable
   messages so views can show friendly text.

**Verification:**
- `npm run lint` passes.
- A temporary call from the browser console returns the seeded tree.

---

## Phase 2 — Customer View (dynamic menu + option modal)

**Deliverable:** `App.jsx` renders the DB menu and supports options in the cart.

**Files:**
- `src/App.jsx` (edit)
- `src/components/OptionSelectModal.jsx` (new)

**Steps:**

1. Remove `import { menuData }`. On mount, `fetchMenuTree()` into state; render
   loading, error (with retry), and empty states.
2. Build category tabs from `fetchCategories()` ordered by `sort_order`.
   Filter items by category client-side.
3. Hide/disable items with `is_available = false`.
4. `OptionSelectModal`: renders each group (radio for `single`, checkbox for
   `multiple`), enforces `is_required`/`min_select`/`max_select`, shows the live
   computed price `base_price + Σ price_delta`, and disables "Add" until valid.
5. Cart line identity: signature = `menu_item_id` + sorted selected
   `option_item_id`s. `addToCart` merges by signature; `removeFromCart` matches
   by signature.
6. Items without groups add directly (unchanged UX).
7. Order insert: build `items` using the snapshot shape from spec section 6 and
   `total_price = Σ line_total`.
8. If an item becomes unavailable while in the cart, flag that line and block
   checkout for it (subscribe via `subscribeToMenu`).

**Verification:**
- Customer can add a variant; the cart shows the correct unit price.
- Two different variants of one item appear as two lines.
- A required group blocks "Add" until a selection is made.
- `npm run lint` passes.

---

## Phase 3 — Admin View

**Deliverable:** `?page=menu` lets owner/manager fully manage the menu.

**Files:**
- `src/components/MenuAdminView.jsx` (new)
- `src/App.jsx` (edit: route + guard)

**Steps:**

1. Add a `menu` case to the query-param router. Guard with `is_manager()`:
   non-managers see the existing access-denied screen.
2. Categories panel: list, create, rename, delete (blocked if referenced),
   reorder.
3. Items panel: list with availability toggle and sort; create/edit form (name,
   description, base price, category, image upload with preview, attach/reorder
   option groups).
4. Option Groups panel: CRUD groups (name, selection type, required, min/max)
   and their options (name, price delta, availability, sort).
5. Destructive actions prompt for confirmation and surface Supabase errors
   inline (no silent failures).

**Verification:**
- Owner can create a category, an item with an image, and an option group, then
  attach the group to the item.
- The new item and options appear on the customer view after a realtime update.
- Toggling availability hides the item from customers.
- Deleting a referenced category is blocked with a clear message.
- `npm run lint` passes.

---

## Phase 4 — Kitchen and Owner Views

**Deliverable:** options render correctly downstream.

**Files:**
- `src/components/DapurView.jsx` (edit)
- `src/components/OwnerView.jsx` (edit)

**Steps:**

1. Kitchen: render each line's selected options beneath the item name; add an
   indented options line to the 58mm receipt. Handle lines that predate options
   (no `options` key) without crashing.
2. Owner: keep best-seller aggregation keyed by item `name`. No KPI change.
   Guard against old order rows lacking the new `items` shape.

**Verification:**
- A variant order shows its options on the kitchen card and the printed receipt.
- Owner totals and best-seller still compute correctly with variant orders.
- An old order row (pre-migration) still renders.
- `npm run lint` passes.

---

## Phase 5 — Cleanup

**Deliverable:** the static menu is gone.

**Files:**
- `src/data/menuData.js` (delete after confirming nothing imports it)

**Steps:**

1. `grep` for `menuData` across `src/`; confirm zero references.
2. Remove the file and the now-empty `src/data` directory if unused.

**Verification:**
- `grep -r "menuData" src/` returns nothing.
- `npm run build` succeeds.

---

## Phase 6 — End-to-End Verification

**Steps:**

1. `npm run lint` and `npm run build` both pass.
2. Run the manual test plan below with the seeded data.
3. Deploy a local preview (`/deploy-website`) and smoke-test the three views.

**Manual test plan:**

| # | Scenario | Expected |
|---|---|---|
| 1 | Customer adds "Mie Ngachoan" with "Level 5-8" | Cart unit price = base + 1500 |
| 2 | Customer adds same item with different level | Two separate cart lines |
| 3 | Customer opens a required group and taps Add | Blocked until a selection |
| 4 | Owner marks an item unavailable | Item hidden on customer view live |
| 5 | Customer places a variant order | Line stored with options snapshot |
| 6 | Kitchen view | Options shown on card + receipt |
| 7 | Owner dashboard | Best-seller and revenue still correct |
| 8 | Owner deletes a referenced category | Blocked with a clear message |
| 9 | Owner uploads an image | Stored in `menu-images`, URL saved |
| 10 | Non-manager opens `?page=menu` | Access denied |

---

## Risks and Notes

- The `staff` table must be seeded before `is_manager()` returns true for the
  owner; otherwise menu writes are denied. Seed before testing the admin view.
- Auth users for `owner@ngachoan.com` and `dapur@ngachoan.com` must exist in
  Supabase Auth.
- Client-side totals remain until sub-project B; not addressed here.
- The Supabase anon key is still hardcoded in `src/supabaseClient.js`; moving it
  to env is sub-project F.
