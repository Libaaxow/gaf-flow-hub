-- Add designer_id column to sales_order_requests for tracking designer assignments
ALTER TABLE public.sales_order_requests 
ADD COLUMN IF NOT EXISTS designer_id uuid REFERENCES public.profiles(id);

-- Add print_operator_id column for tracking print operator assignments  
ALTER TABLE public.sales_order_requests 
ADD COLUMN IF NOT EXISTS print_operator_id uuid REFERENCES public.profiles(id);

-- Update RLS policy for sales to view status updates
DROP POLICY IF EXISTS "Sales can view their own order requests" ON public.sales_order_requests;
CREATE POLICY "Sales can view their own order requests" 
ON public.sales_order_requests 
FOR SELECT 
USING (created_by = auth.uid());