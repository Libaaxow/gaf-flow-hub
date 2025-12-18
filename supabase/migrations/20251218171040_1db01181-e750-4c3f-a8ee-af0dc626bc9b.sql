-- Drop the restrictive designer upload policy
DROP POLICY IF EXISTS "Designers can upload files to assigned requests" ON public.request_files;

-- Recreate as a PERMISSIVE policy (the default)
CREATE POLICY "Designers can upload files to assigned requests" 
ON public.request_files 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sales_order_requests
    WHERE sales_order_requests.id = request_files.request_id 
    AND sales_order_requests.designer_id = auth.uid()
  )
);