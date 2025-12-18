-- Fix the designer update policy to allow design_submitted status
DROP POLICY IF EXISTS "Designers can update their assigned requests" ON public.sales_order_requests;

CREATE POLICY "Designers can update their assigned requests"
ON public.sales_order_requests
FOR UPDATE
USING (
  designer_id = auth.uid()
  AND status = 'in_design'
)
WITH CHECK (
  designer_id = auth.uid()
  AND status IN ('in_design', 'design_submitted')
);