-- Drop the existing broad update policy
DROP POLICY IF EXISTS "Authorized users can update orders" ON public.orders;

-- Create separate policies for different update scenarios
-- Policy 1: Accountants and admins can update everything including payment status
CREATE POLICY "Accountants and admins can update all order fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'accountant'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Policy 2: Other authorized users can update orders except payment fields
CREATE POLICY "Authorized users can update non-payment fields"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'designer'::app_role) OR 
  has_role(auth.uid(), 'print_operator'::app_role)
)
WITH CHECK (
  -- Ensure payment_status and amount_paid are not changed by these roles
  (payment_status IS NOT DISTINCT FROM (SELECT payment_status FROM public.orders WHERE id = orders.id)) AND
  (amount_paid IS NOT DISTINCT FROM (SELECT amount_paid FROM public.orders WHERE id = orders.id))
);