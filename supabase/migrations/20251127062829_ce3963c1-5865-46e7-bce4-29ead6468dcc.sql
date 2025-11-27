-- Fix RLS policies to allow proper workflow while maintaining security

-- Drop ALL existing update policies to start fresh
DROP POLICY IF EXISTS "Sales can update pending orders" ON public.orders;
DROP POLICY IF EXISTS "Accountants can update orders at approval stages" ON public.orders;
DROP POLICY IF EXISTS "Designers can update assigned designing orders" ON public.orders;
DROP POLICY IF EXISTS "Print operators can update printing orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all order fields" ON public.orders;
DROP POLICY IF EXISTS "Accountants can update all order fields" ON public.orders;

-- Admins have full update access
CREATE POLICY "Admins can update all order fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Accountants have full update access to manage workflow (approve, assign designers, etc)
CREATE POLICY "Accountants can update all order fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role)
);

-- Sales can update their own pending orders (before accountant approval)
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

-- Designers can update orders assigned to them during design phase
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

-- Print operators can update orders during print phase
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