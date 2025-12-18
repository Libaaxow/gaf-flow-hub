-- Add RLS policy for print operators to view and update their assigned sales order requests
DROP POLICY IF EXISTS "Print operators can view their assigned requests" ON public.sales_order_requests;
DROP POLICY IF EXISTS "Print operators can update their assigned requests" ON public.sales_order_requests;

CREATE POLICY "Print operators can view their assigned requests"
ON public.sales_order_requests
FOR SELECT
USING (print_operator_id = auth.uid());

CREATE POLICY "Print operators can update their assigned requests"
ON public.sales_order_requests
FOR UPDATE
USING (
  print_operator_id = auth.uid()
  AND status = 'in_print'
)
WITH CHECK (
  print_operator_id = auth.uid()
  AND status IN ('in_print', 'printed')
);