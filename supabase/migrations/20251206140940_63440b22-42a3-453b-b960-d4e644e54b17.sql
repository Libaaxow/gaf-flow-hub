-- Add SELECT policy for invoices so all authenticated users can view them for analytics
CREATE POLICY "All authenticated users can view invoices"
ON public.invoices
FOR SELECT
USING (true);

-- Drop the restrictive accountant/admin only SELECT policy (keep the other CRUD policies)
DROP POLICY IF EXISTS "Accountants and admins can view invoices" ON public.invoices;