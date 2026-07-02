
# Sales / Designer / Production Workflow Overhaul

Finance (invoices, payments, expenses, commissions, accountant/admin/board dashboards) stays untouched. All changes are additive on the order/lead flow.

## 1. Database changes (one migration)

**New `leads` table**
- Fields: customer_id, title, description, source, status ('new' | 'converted' | 'lost'), owner_id (creator), created_by_role, converted_order_id (nullable).
- RLS: Sales sees own leads; Designers see own leads + all leads assigned to them; Production has no access; Admin/Accountant read-only.
- GRANTs for authenticated + service_role.

**New `activity_log` table** (order + lead timeline)
- Fields: entity_type ('lead' | 'order'), entity_id, actor_id, actor_role, action (text), details (jsonb).
- RLS: any authenticated user tied to the entity can read; insert via triggers/service.
- Auto-populated by triggers on leads + orders.

**Extend `orders`**
- Add `owner_id uuid` (creator) and `production_stage` enum ('not_sent' | 'sent_to_production' | 'in_production' | 'completed').
- Backfill existing rows: owner_id ← salesperson_id or created_by; production_stage from current status.

**Print operator treated as Production**
- No rename. Existing `print_operator` role continues; UI labels updated to "Production".

## 2. Role rules enforced in code + RLS

**Sales**
- Can create Leads, convert Lead → Order, must select Designer on the order form (form validation: designer_id required).
- Cannot set production_stage beyond `not_sent`. Cannot mark completed.

**Designer**
- Can create Leads (auto owner = self).
- Convert own Lead → Order (auto-assigns self as designer).
- Works design stage; single button "Send to Production" sets production_stage = 'sent_to_production'.
- Cannot reassign to other designers, cannot mark completed.

**Production (print_operator role)**
- Sees only orders with production_stage in ('sent_to_production', 'in_production').
- Buttons: "Start Production" → in_production; "Mark Completed" → completed.
- Cannot edit customer/design data, cannot see pre-production orders.

**Finance roles (accountant, admin, board): unchanged.** They keep read access to everything.

## 3. UI changes

- New page `/leads` with list + create dialog + "Convert to Order" action (Sales & Designer only in nav).
- Order form: designer dropdown becomes required for Sales; auto-filled + locked for Designer-created orders.
- Order detail: add "Send to Production" button (designer only), "Start Production" / "Mark Completed" buttons (production only). Show Activity Timeline pulled from `activity_log`.
- Nav updates:
  - Sales: Dashboard, Leads, Customers, Products, Orders, Settings.
  - Designer: Dashboard, Leads, Orders (assigned), Settings.
  - Production: Dashboard, Orders (in production queue), Settings.
  - Finance roles: unchanged.

## 4. Activity log

Triggers on `leads` and `orders` insert rows into `activity_log` with actor = `auth.uid()` for: created, converted, designer_assigned, sent_to_production, production_started, completed. Timeline component renders it on lead/order detail.

## 5. Out of scope (untouched)

- Invoices, payments, expenses, vendor bills/POs, commissions, wallets, shareholders, tax settings.
- Accountant, admin, board dashboards.
- Invoice numbering, draft invoice flow.

## Files touched (approx.)

- Migration: new tables, columns, triggers, RLS, GRANTs.
- New: `src/pages/Leads.tsx`, `src/components/ActivityTimeline.tsx`, `src/components/ConvertLeadDialog.tsx`.
- Edit: `src/App.tsx` (routes), `src/components/Layout.tsx` (nav per role), `src/pages/Orders.tsx`, `src/pages/OrderDetail.tsx`, `src/pages/SalesDashboard.tsx`, `src/pages/DesignerDashboard.tsx`, `src/pages/PrintOperatorDashboard.tsx`.

Approve and I'll run the migration first, then wire the UI.
