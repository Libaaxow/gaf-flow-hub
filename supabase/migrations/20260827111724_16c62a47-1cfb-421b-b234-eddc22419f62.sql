CREATE POLICY "Sales can view payments linked to their requests"
ON public.payments
FOR SELECT
TO authenticated
USING (
  sales_request_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.sales_order_requests r
    WHERE r.id = payments.sales_request_id
      AND r.created_by = auth.uid()
  )
);