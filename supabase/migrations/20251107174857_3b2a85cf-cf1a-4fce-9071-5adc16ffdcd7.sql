-- Update RLS policy to allow marketing role to create customers
DROP POLICY IF EXISTS "Sales and admins can create customers" ON public.customers;

CREATE POLICY "Sales, marketing and admins can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'marketing'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update RLS policy to allow marketing role to update customers
DROP POLICY IF EXISTS "Sales and admins can update customers" ON public.customers;

CREATE POLICY "Sales, marketing and admins can update customers" 
ON public.customers 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'marketing'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update orders RLS policy to allow marketing role
DROP POLICY IF EXISTS "Sales and admins can create orders" ON public.orders;

CREATE POLICY "Sales, marketing and admins can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'marketing'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);