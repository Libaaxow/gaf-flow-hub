-- Add new order statuses for accountant-centered workflow
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_accounting_review';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_accounting_approval';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_print';