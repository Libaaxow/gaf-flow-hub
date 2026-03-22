
-- Allow accountants to view shareholders (for the dropdown)
CREATE POLICY "Accountants can view shareholders"
ON public.shareholders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Allow accountants to insert shareholder transactions (for debt tagging)
CREATE POLICY "Accountants can insert shareholder transactions"
ON public.shareholder_transactions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));
