-- Drop the problematic policy
DROP POLICY IF EXISTS "Authorized users can update non-payment fields" ON public.orders;

-- Recreate it with the correct subquery that references the current row
CREATE POLICY "Authorized users can update non-payment fields" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'designer'::app_role) OR 
  has_role(auth.uid(), 'print_operator'::app_role)
)
WITH CHECK (
  payment_status IS NOT DISTINCT FROM (
    SELECT o.payment_status FROM orders o WHERE o.id = orders.id
  )
  AND
  amount_paid IS NOT DISTINCT FROM (
    SELECT o.amount_paid FROM orders o WHERE o.id = orders.id
  )
);