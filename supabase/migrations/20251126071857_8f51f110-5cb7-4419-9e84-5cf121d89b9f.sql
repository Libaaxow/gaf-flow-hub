-- Drop the existing broad view policy
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;

-- Sales can view orders they created
CREATE POLICY "Sales can view their own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) 
  AND salesperson_id = auth.uid()
);

-- Accountants can view orders in pending status or awaiting their approval
CREATE POLICY "Accountants can view orders needing approval"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role)
  AND status IN ('pending', 'awaiting_accounting_approval', 'pending_accounting_review')
);

-- Designers can view orders assigned to them in designing status
CREATE POLICY "Designers can view their assigned orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role)
  AND designer_id = auth.uid()
  AND status IN ('designing', 'designed')
);

-- Print operators can view orders ready for printing
CREATE POLICY "Print operators can view print-ready orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'print_operator'::app_role)
  AND status IN ('ready_for_print', 'printing', 'printed', 'ready_for_collection')
);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Marketing can view all orders (if needed for reports)
CREATE POLICY "Marketing can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'marketing'::app_role));