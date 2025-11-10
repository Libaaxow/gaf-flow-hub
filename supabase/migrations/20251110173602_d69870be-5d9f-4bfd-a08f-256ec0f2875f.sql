-- Allow accountants to delete invoices (not just admins)
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

CREATE POLICY "Admins and accountants can delete invoices"
ON public.invoices
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accountant'::app_role)
);