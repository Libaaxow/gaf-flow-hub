-- Fix INSERT policy for orders to allow proper order creation

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Sales, marketing and admins can create orders" ON public.orders;

-- Create new INSERT policy that allows sales, marketing, and admins to create orders
-- without restrictive checks that might block order creation
CREATE POLICY "Sales, marketing and admins can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) 
  OR has_role(auth.uid(), 'marketing'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);