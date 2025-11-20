-- Ensure admins have unrestricted access to orders
-- Drop existing restrictive policies and create comprehensive admin policy

-- Drop the policy that restricts non-payment field updates for other roles
DROP POLICY IF EXISTS "Authorized users can update non-payment fields" ON public.orders;

-- Ensure admin has full UPDATE access
DROP POLICY IF EXISTS "Accountants and admins can update all order fields" ON public.orders;
CREATE POLICY "Admins can update all order fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create separate policy for accountants
CREATE POLICY "Accountants can update all order fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

-- Recreate the limited update policy for other roles
CREATE POLICY "Other roles can update non-payment fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'designer'::app_role) OR 
  has_role(auth.uid(), 'print_operator'::app_role)
)
WITH CHECK (
  (has_role(auth.uid(), 'sales'::app_role) OR 
   has_role(auth.uid(), 'designer'::app_role) OR 
   has_role(auth.uid(), 'print_operator'::app_role))
  AND 
  -- Prevent modification of payment fields
  (payment_status IS NOT DISTINCT FROM (SELECT o.payment_status FROM orders o WHERE o.id = orders.id))
  AND 
  (amount_paid IS NOT DISTINCT FROM (SELECT o.amount_paid FROM orders o WHERE o.id = orders.id))
);