-- Add policy for accountants to create customers
CREATE POLICY "Accountants can create customers"
ON public.customers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));