CREATE POLICY "Authenticated users can view sales roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role IN ('sales'::app_role, 'marketing'::app_role));