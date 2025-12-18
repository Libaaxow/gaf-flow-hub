-- Allow admins to view all sales order requests
CREATE POLICY "Admins can view all order requests"
ON public.sales_order_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update all sales order requests
CREATE POLICY "Admins can update all order requests"
ON public.sales_order_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert sales order requests
CREATE POLICY "Admins can insert order requests"
ON public.sales_order_requests
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert request files
CREATE POLICY "Admins can insert request files"
ON public.request_files
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update request files
CREATE POLICY "Admins can update request files"
ON public.request_files
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));