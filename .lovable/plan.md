# Contra Settlement (Vendor–Customer Offset)

Lets Finance cancel out money a contact owes us against money we owe them, in one step.

## How it will work

1. New **Contra Settlement** button on the Vendor Payments page (Finance area), plus the same panel reachable from the Accountant home.
2. In the dialog:
   - Pick the **customer** side and the **vendor** side of the same contact. The vendor list is pre-sorted so name matches appear first, so in most cases both are chosen with one click.
   - The system loads their unpaid/partly-paid invoices (money they owe us) and unpaid/partly-paid bills (money we owe them), with totals for each side.
   - It shows the suggested offset = the smaller of the two totals. The user can lower it but not exceed it.
   - The user ticks which invoices and which bills the offset applies to; the amount is spread oldest-first, and each line shows how much of it gets cleared.
3. Pressing **Process Contra Offset** records, in one go:
   - A payment against each selected invoice, marked as a contra settlement (so the invoice's paid amount and status update automatically as they do today).
   - A vendor payment against each selected bill, marked as a contra settlement (bill status updates as today).
   - An audit entry: `Contra Settlement Processed: Offset $X against Invoice #INV-XXX and Bill #BILL-XXX`.
4. Remaining balances are recalculated automatically, so the invoice list keeps showing the true net amount still due in cash.

## Visual indicators

- Invoice payment breakdown (invoice dialog / payment report): contra lines show a badge **"Paid via Contra Offset"**.
- Vendor bill breakdown: contra lines show **"Cleared via Contra Offset"**.
- Unpaid invoice lists show remaining net amount after contra, as they do for any payment.

## Accounting note

A contra offset moves no cash. To keep Net Profit and cash figures honest, contra vendor payments will **not** create an expense record (unlike cash vendor payments) — the debt is settled against a receivable, not paid out. The offset is instead recorded as a clearing entry on both documents.

## Technical details

- Migration: add `'contra'` to the `payment_method` enum; add `is_contra boolean default false` and `contra_reference text` to `payments` and `vendor_payments`; add a `contra_settlements` header table (customer_id, vendor_id, amount, reference, created_by) with GRANTs and RLS limited to admin/accountant (read) and admin/accountant (insert), no update/delete.
- New component `src/components/ContraSettlementPanel.tsx` holding the dialog and processing logic; mounted in `src/pages/VendorPayments.tsx` and the Finance dashboard.
- Uses existing triggers (`tg_payments_recompute_invoice`, `update_vendor_bill_on_payment`) so statuses and paid amounts stay consistent — no new balance math on invoices or bills.
- Audit rows written to `activity_log` (entity_type `contra_settlement`).
- Badges added where payment rows are rendered: `InvoiceDialog.tsx`, `PaymentReport.tsx`, `VendorBills.tsx`, `VendorPayments.tsx`.
