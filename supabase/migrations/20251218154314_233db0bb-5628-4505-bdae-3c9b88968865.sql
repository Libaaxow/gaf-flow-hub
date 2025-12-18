-- Allow designers to view their assigned sales order requests
CREATE POLICY "Designers can view their assigned requests" 
ON public.sales_order_requests 
FOR SELECT 
USING (designer_id = auth.uid());

-- Allow designers to update their assigned requests (for status changes)
CREATE POLICY "Designers can update their assigned requests" 
ON public.sales_order_requests 
FOR UPDATE 
USING (designer_id = auth.uid() AND status = 'in_design')
WITH CHECK (designer_id = auth.uid() AND status IN ('in_design', 'in_print'));