-- Update RLS policies to restrict payments, invoices, and invoice_items to accountants only

-- Drop existing policies for payments table
DROP POLICY IF EXISTS "Accountants and admins can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Accountants and admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Accountants and admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;

-- Create new policies for payments (accountants only)
CREATE POLICY "Only accountants can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can view payments"
ON public.payments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Drop existing policies for invoices table
DROP POLICY IF EXISTS "Accountants and admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Accountants and admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Accountants and admins can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins and accountants can delete invoices" ON public.invoices;

-- Create new policies for invoices (accountants only)
CREATE POLICY "Only accountants can insert invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can update invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can view invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can delete invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Drop existing policies for invoice_items table
DROP POLICY IF EXISTS "Accountants and admins can insert invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Accountants and admins can update invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Accountants and admins can view all invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Admins can delete invoice items" ON public.invoice_items;

-- Create new policies for invoice_items (accountants only)
CREATE POLICY "Only accountants can insert invoice items"
ON public.invoice_items
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can update invoice items"
ON public.invoice_items
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can view invoice items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Only accountants can delete invoice items"
ON public.invoice_items
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));