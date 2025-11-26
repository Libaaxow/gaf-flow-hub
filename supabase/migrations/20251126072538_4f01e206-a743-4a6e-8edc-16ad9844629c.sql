-- Drop existing UPDATE policies to replace with status-based ones
DROP POLICY IF EXISTS "Other roles can update non-payment fields" ON public.orders;
DROP POLICY IF EXISTS "Accountants can update all order fields" ON public.orders;

-- Sales can only update their orders in 'pending' status (before accountant approval)
CREATE POLICY "Sales can update pending orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role)
  AND salesperson_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role)
  AND salesperson_id = auth.uid()
  AND status = 'pending'
);

-- Accountants can update orders at any approval stage (they control the workflow)
CREATE POLICY "Accountants can update orders at approval stages"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role)
  AND status IN ('pending', 'designing', 'designed', 'awaiting_accounting_approval', 'pending_accounting_review', 'ready_for_print')
)
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role)
);

-- Designers can only update orders assigned to them in 'designing' status
CREATE POLICY "Designers can update assigned designing orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role)
  AND designer_id = auth.uid()
  AND status IN ('designing', 'designed')
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role)
  AND designer_id = auth.uid()
  AND status IN ('designing', 'designed', 'awaiting_accounting_approval')
);

-- Print operators can only update orders in printing stages
CREATE POLICY "Print operators can update printing orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'print_operator'::app_role)
  AND status IN ('ready_for_print', 'printing', 'printed')
)
WITH CHECK (
  has_role(auth.uid(), 'print_operator'::app_role)
  AND status IN ('printing', 'printed', 'ready_for_collection')
);

-- Keep admin policy as-is (admins can update everything)
-- Marketing cannot update orders (view only)