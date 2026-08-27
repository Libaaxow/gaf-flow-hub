ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sales_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_sales_user_id ON public.payments(sales_user_id);

DROP POLICY IF EXISTS "Sales can view payments linked to them" ON public.payments;
CREATE POLICY "Sales can view payments linked to them"
ON public.payments
FOR SELECT
TO authenticated
USING (sales_user_id IS NOT NULL AND sales_user_id = auth.uid());