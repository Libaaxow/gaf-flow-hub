
-- Make order_id nullable in payments table and add invoice_id
ALTER TABLE payments 
  ALTER COLUMN order_id DROP NOT NULL;

-- Add invoice_id column to payments table
ALTER TABLE payments 
  ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;

-- Add check constraint to ensure either order_id or invoice_id is present
ALTER TABLE payments 
  ADD CONSTRAINT payments_order_or_invoice_check 
  CHECK (order_id IS NOT NULL OR invoice_id IS NOT NULL);

-- Create index on invoice_id for better query performance
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
