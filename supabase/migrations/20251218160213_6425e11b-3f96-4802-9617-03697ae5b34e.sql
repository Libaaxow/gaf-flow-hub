-- Add invoice tracking fields to sales_order_requests
ALTER TABLE public.sales_order_requests
ADD COLUMN IF NOT EXISTS linked_invoice_id uuid REFERENCES public.invoices(id),
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'debt'));

-- Add comment for clarity
COMMENT ON COLUMN public.sales_order_requests.linked_invoice_id IS 'Invoice linked to this sales request after design submission';
COMMENT ON COLUMN public.sales_order_requests.payment_status IS 'Payment status: pending, paid, or debt';