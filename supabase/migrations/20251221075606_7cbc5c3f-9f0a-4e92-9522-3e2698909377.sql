-- Drop the existing check constraint
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- Add new check constraint that includes 'partially_paid'
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check 
CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'partially_paid'::text, 'overdue'::text, 'cancelled'::text]));