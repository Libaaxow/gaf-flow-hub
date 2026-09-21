DROP POLICY "Sales, marketing and admins can update customers" ON public.customers;
CREATE POLICY "Sales, marketing, accountants and admins can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'marketing'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);