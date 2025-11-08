-- Allow authenticated users to view designer roles (needed for designer assignment)
CREATE POLICY "Authenticated users can view designer roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'designer');