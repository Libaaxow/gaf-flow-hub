CREATE POLICY "Print operators can view all order requests"
ON public.sales_order_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'print_operator'));

CREATE POLICY "Print operators can view all request files"
ON public.request_files
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'print_operator'));