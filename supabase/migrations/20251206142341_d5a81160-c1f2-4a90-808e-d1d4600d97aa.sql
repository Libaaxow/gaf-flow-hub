-- Allow board members to view all orders
CREATE POLICY "Board can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Allow board members to view all payments
CREATE POLICY "Board can view all payments"
ON public.payments
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Allow board members to view all expenses
CREATE POLICY "Board can view all expenses"
ON public.expenses
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Allow board members to view all invoices
CREATE POLICY "Board can view all invoices"
ON public.invoices
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Allow board members to view all commissions
CREATE POLICY "Board can view all commissions"
ON public.commissions
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Allow board members to view all customers
CREATE POLICY "Board can view all customers"
ON public.customers
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));