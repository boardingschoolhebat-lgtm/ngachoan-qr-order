# Menu Management (Dynamic Menu + Variants) — Design Spec

Date: 2026-10-15
Project: Ngachoan QR-Order (React + Vite + Tailwind + Supabase)
Sub-project: A — Menu Management

## 1. Context and Goal

Today the menu is a hardcoded array in `src/data/menuData.js`. Changing a price,
description, or photo requires a developer and a redeploy. The restaurant is
heading toward real production use and needs to manage its own menu.

This sub-project moves the menu into Postgres (Supabase), adds a role-guarded
admin UI, supports reusable option groups with variant pricing, and updates the
customer, kitchen, and owner views to consume the dynamic menu and render
selected options.

### Goal

A restaurant owner or manager can fully manage the menu (categories, items,
availability, images, sort order, and reusable option groups with variant
pricing) through the app, without a developer, and customers can order items
that carry selected options that flow correctly to the kitchen and reports.

### Roadmap position

This is sub-project A of a larger "go-live for a single restaurant" effort.
Deferred sub-projects:

- **B — Order & payment lifecycle:** split `payment_status` from `order_status`,
  server-side price validation, pay-online vs pay-at-counter.
- **C — Online payment gateway:** Midtrans/Xendit/QRIS charge creation, signed
  webhook, reconciliation.
- **D — Staff, roles & tables:** full staff/role management UI, table & QR
  management.
- **E — Reporting & close-out:** historical/date-range reports, payment-method
  breakdown, daily closing, CSV export.
- **F — Security & reliability:** moving keys to env, broader RLS hardening.

## 2. Architecture

**Approach chosen: DB-driven, direct Supabase client access.**

The menu lives in Postgres. All three views read directly through the Supabase
JS client, consistent with the existing application architecture. Admin writes
go through RLS-guarded tables. Images live in a Supabase Storage bucket.
Realtime subscriptions keep the customer menu, kitchen, and admin in sync.
`src/data/menuData.js` is deleted after a seed migration populates the tables.

Rejected alternatives:

- **DB with static fallback:** two sources of truth that drift, and orders
  cannot be placed during an outage anyway, so the fallback adds little.
- **Backend-first (Edge Functions):** significant new infrastructure, premature
  for menu CRUD. Deferred to sub-project C where a backend is actually required.

### Known limitation

Order totals remain computed client-side until sub-project B. The server does
not yet re-validate prices. A Postgres total-validation function may be added
as a safety net, but full server-side pricing is out of scope here.

## 3. Data Model

All tables are new except `orders`, which already exists.

### categories

| column | type | notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| name | text not null | e.g. "Mie" |
| sort_order | int not null | default 0 |
| created_at | timestamptz | default now() |

### menu_items

| column | type | notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| category_id | uuid fk → categories(id) | not null |
| name | text not null | |
| description | text | nullable |
| base_price | numeric(12,2) not null | IDR, check `>= 0` |
| image_url | text | nullable |
| is_available | boolean not null | default true |
| sort_order | int not null | default 0 |
| created_at / updated_at | timestamptz | |

### option_groups (reusable)

| column | type | notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| name | text not null | e.g. "Spice Level" |
| selection_type | text not null | check `in ('single','multiple')` |
| is_required | boolean not null | default false |
| min_select | int not null | default 0 |
| max_select | int | nullable |
| sort_order | int not null | default 0 |
| created_at | timestamptz | |

### option_items

| column | type | notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| group_id | uuid fk → option_groups(id) | not null |
| name | text not null | e.g. "Level 3" |
| price_delta | numeric(12,2) not null | default 0 |
| is_available | boolean not null | default true |
| sort_order | int not null | default 0 |

### menu_item_option_groups (join)

| column | type | notes |
|---|---|---|
| menu_item_id | uuid fk → menu_items(id) | part of pk |
| option_group_id | uuid fk → option_groups(id) | part of pk |
| sort_order | int not null | default 0 |

Composite primary key `(menu_item_id, option_group_id)`.

### staff (minimal role)

| column | type | notes |
|---|---|---|
| user_id | uuid pk | fk → auth.users(id) |
| email | text not null | |
| role | text not null | check `in ('owner','manager','kitchen')` |
| created_at | timestamptz | |

Seeded with the existing accounts: `owner@ngachoan.com` (role `owner`) and
`dapur@ngachoan.com` (role `kitchen`). A helper `is_manager()` returns true for
the current `auth.uid()` when their role is `owner` or `manager`.

### orders (existing, unchanged schema)

The `items` JSONB column changes shape to carry option snapshots per line
(see section 6). No column changes are required.

### Storage

Bucket `menu-images`. Public read; write restricted to owner/manager.

## 4. Security (RLS)

- Public (`anon`) read (SELECT) on `categories`, `menu_items`, `option_groups`,
  `option_items`, `menu_item_option_groups`. The customer menu is public.
- Write (INSERT/UPDATE/DELETE) on all menu tables allowed only to authenticated
  users where `is_manager()` is true.
- `staff`: SELECT only for the current user's own row (`user_id = auth.uid()`);
  no client write policy (managed manually or via service role for now).
- Storage `menu-images`: public SELECT; INSERT/UPDATE/DELETE require
  `is_manager()`.

`is_manager()` is a `SECURITY DEFINER` SQL function that looks up the current
user's role in `staff` and returns a boolean, avoiding recursive RLS.

## 5. UI and Component Architecture

Routing remains query-param based. A new `?page=menu` route is added.

### Customer — `src/App.jsx`

- On mount, fetch `categories`, `menu_items`, and the option structure into
  component state, replacing the `menuData` import.
- Category tabs are rendered from the fetched `categories` (ordered by
  `sort_order`) instead of derived from the menu array.
- Tapping "Tambah +" on an item that has option groups opens an
  **option-selection modal**: radio buttons for `single`, checkboxes for
  `multiple`, enforcing `is_required`/`min_select`/`max_select`, with a live
  computed price. Items with no option groups add directly as they do today.
- Unavailable items (`is_available = false`) are hidden or visibly disabled.

### Admin — `src/components/MenuAdminView.jsx` (new, `?page=menu`)

Guarded by the role check (owner/manager only; others see the existing
access-denied screen). Three panels:

1. **Categories** — create, rename, delete, reorder.
2. **Items** — list with availability toggle and sort; create/edit form with
   name, description, base price, category, image upload, and attach/reorder
   option groups.
3. **Option Groups** — CRUD shared groups and their options (name, price delta,
   availability, sort), then attach groups to items.

Image upload writes to the `menu-images` bucket with a preview.

### Kitchen — `src/components/DapurView.jsx`

- Each order line renders its selected options beneath the item name.
- The 58mm thermal receipt gains an indented options line per item.

### Owner — `src/components/OwnerView.jsx`

- Best-seller aggregation stays keyed by item name. Options are detail, not
  separate products. No structural change to the KPI cards.

## 6. Data Flow

**Read.** Customer and admin fetch the menu via Supabase. A realtime
subscription on menu tables pushes availability and price changes live.

**Cart line identity.** A cart line is unique by `menu_item_id` plus the sorted
set of selected `option_item_id`s (a signature string). Two different option
selections produce two separate lines.

`unit_price = base_price + Σ option_item.price_delta`

**Order snapshot.** Each `orders.items` line is stored as:

```json
{
  "menu_item_id": "uuid",
  "name": "Mie Ngachoan",
  "base_price": 15000,
  "quantity": 2,
  "options": [
    { "group_name": "Spice Level", "option_item_id": "uuid", "option_name": "Level 3", "price_delta": 0 }
  ],
  "unit_price": 15000,
  "line_total": 30000
}
```

`total_price = Σ line_total`. Snapshots mean later menu edits never rewrite
historical orders.

## 7. Error Handling and Edge Cases

- Loading, error, and empty states for every DB read, with a friendly retry.
  Never a blank screen.
- Image upload validates MIME type and a maximum size; failures show inline.
- Concurrency: the admin availability toggle treats the DB as source of truth;
  customer views re-render from realtime events rather than local guesses.
- Deleting a category or option group that is referenced is blocked with a
  clear message (soft guard); do not orphan items.
- Availability at checkout: unavailable items are hidden/disabled. If an item
  sells out while sitting in a cart, the cart flags that line and blocks
  checkout for it.
- Option validation: required groups must have a selection; `min_select` and
  `max_select` are enforced in the modal before the item can be added.

## 8. Testing

No test runner exists in the project today.

- `npm run lint` must pass.
- A documented manual test plan covering: customer adds a variant and it carries
  the correct price; kitchen sees the selected options; owner totals are
  unchanged by option selection semantics (keyed by item name); admin CRUD for
  categories, items, option groups, and attachments; image upload; availability
  toggle propagates to the customer view via realtime.

Adding Vitest or another test runner is out of scope for this sub-project.

## 9. Out of Scope

- Server-side price validation and split payment/kitchen statuses (B)
- Real payment gateway (C)
- Full roles/staff management UI, table & QR management (D)
- Historical/date-range reporting, export, daily closing (E)
- Moving keys to env and broader anon-key hardening beyond menu RLS (F)
