-- Update invoice policies to include admins
DROP POLICY IF EXISTS "Only accountants can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Only accountants can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Only accountants can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Only accountants can delete invoices" ON public.invoices;

CREATE POLICY "Accountants and admins can view invoices" ON public.invoices
FOR SELECT USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can insert invoices" ON public.invoices
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can update invoices" ON public.invoices
FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can delete invoices" ON public.invoices
FOR DELETE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

-- Update invoice_items policies to include admins
DROP POLICY IF EXISTS "Only accountants can view invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Only accountants can insert invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Only accountants can update invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Only accountants can delete invoice items" ON public.invoice_items;

CREATE POLICY "Accountants and admins can view invoice items" ON public.invoice_items
FOR SELECT USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can insert invoice items" ON public.invoice_items
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can update invoice items" ON public.invoice_items
FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can delete invoice items" ON public.invoice_items
FOR DELETE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

-- Update payments policies to include admins
DROP POLICY IF EXISTS "Only accountants can view payments" ON public.payments;
DROP POLICY IF EXISTS "Only accountants can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Only accountants can update payments" ON public.payments;
DROP POLICY IF EXISTS "Only accountants can delete payments" ON public.payments;

CREATE POLICY "Accountants and admins can view payments" ON public.payments
FOR SELECT USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can insert payments" ON public.payments
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can update payments" ON public.payments
FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can delete payments" ON public.payments
FOR DELETE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

-- Update expenses policies to ensure admins have full access
DROP POLICY IF EXISTS "Accountants and admins can view all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Accountants and admins can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Accountants and admins can update expenses" ON public.expenses;

CREATE POLICY "Accountants and admins can view all expenses" ON public.expenses
FOR SELECT USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can insert expenses" ON public.expenses
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants and admins can update expenses" ON public.expenses
FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));