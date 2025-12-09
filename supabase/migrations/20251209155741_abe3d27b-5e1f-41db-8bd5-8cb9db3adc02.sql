-- Add discount fields to invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- Add discount fields to payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_reason text;

-- Add comment for clarity
COMMENT ON COLUMN public.payments.discount_type IS 'fixed or percentage';
COMMENT ON COLUMN public.payments.discount_value IS 'The input value (amount or percentage)';
COMMENT ON COLUMN public.payments.discount_amount IS 'The calculated discount amount';
COMMENT ON COLUMN public.payments.discount_reason IS 'Optional reason for the discount';