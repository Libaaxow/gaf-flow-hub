CREATE POLICY "Sales can upload files to their own requests"
ON public.request_files FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sales_order_requests s
    WHERE s.id = request_files.request_id AND s.created_by = auth.uid()
  )
);

CREATE POLICY "Users can view files for requests they created"
ON public.request_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_order_requests s
    WHERE s.id = request_files.request_id AND s.created_by = auth.uid()
  )
);