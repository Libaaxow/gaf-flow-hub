-- Drop and recreate the customers INSERT policy to include designers
DROP POLICY IF EXISTS "Sales, marketing and admins can create customers" ON public.customers;

CREATE POLICY "Sales, marketing, designers and admins can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'marketing'::app_role) OR 
  has_role(auth.uid(), 'designer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Drop and recreate the orders INSERT policy to include designers
DROP POLICY IF EXISTS "Sales, marketing and admins can create orders" ON public.orders;

CREATE POLICY "Sales, marketing, designers and admins can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) OR 
  has_role(auth.uid(), 'marketing'::app_role) OR 
  has_role(auth.uid(), 'designer'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);