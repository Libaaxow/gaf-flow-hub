-- Create sales_order_requests table for sales notes/requests
-- These are simple requests that don't affect finances or inventory
CREATE TABLE public.sales_order_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  company_name TEXT,
  description TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_order_requests ENABLE ROW LEVEL SECURITY;

-- Sales can create order requests
CREATE POLICY "Sales can create order requests"
ON public.sales_order_requests
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'sales'::app_role));

-- Sales can view their own order requests
CREATE POLICY "Sales can view their own order requests"
ON public.sales_order_requests
FOR SELECT
USING (created_by = auth.uid());

-- Accountants and admins can view all order requests
CREATE POLICY "Accountants and admins can view all order requests"
ON public.sales_order_requests
FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Accountants and admins can update order requests (to mark as processed)
CREATE POLICY "Accountants and admins can update order requests"
ON public.sales_order_requests
FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete order requests
CREATE POLICY "Admins can delete order requests"
ON public.sales_order_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));