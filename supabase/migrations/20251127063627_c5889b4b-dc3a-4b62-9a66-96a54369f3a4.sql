-- Fix SELECT policies to allow users to see orders they need to work with
-- Keep UPDATE restrictions based on workflow stages

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Sales can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Accountants can view orders needing approval" ON public.orders;
DROP POLICY IF EXISTS "Designers can view their assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Print operators can view print-ready orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Marketing can view all orders" ON public.orders;

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Accountants can view all orders (they manage the workflow)
CREATE POLICY "Accountants can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role)
);

-- Sales can view all orders (need to see to create and manage)
CREATE POLICY "Sales can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role)
);

-- Marketing can view all orders
CREATE POLICY "Marketing can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'marketing'::app_role)
);

-- Designers can view all orders (need to see available jobs and assignments)
CREATE POLICY "Designers can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role)
);

-- Print operators can view all orders (need to see what's coming)
CREATE POLICY "Print operators can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'print_operator'::app_role)
);