-- Allow authenticated users to view print operator roles
CREATE POLICY "Authenticated users can view print operator roles"
ON public.user_roles
FOR SELECT
USING (role = 'print_operator'::app_role);