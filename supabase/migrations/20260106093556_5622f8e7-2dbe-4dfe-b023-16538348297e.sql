-- Add invoice_id column to commissions table for invoice-based commissions
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id);

-- Make order_id nullable since commissions can now come from invoices
ALTER TABLE public.commissions ALTER COLUMN order_id DROP NOT NULL;

-- Add constraint to ensure at least one of order_id or invoice_id is set
ALTER TABLE public.commissions ADD CONSTRAINT commissions_order_or_invoice_check 
CHECK (order_id IS NOT NULL OR invoice_id IS NOT NULL);