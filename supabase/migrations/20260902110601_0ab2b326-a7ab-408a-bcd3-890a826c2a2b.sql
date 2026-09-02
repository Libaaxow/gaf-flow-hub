DROP POLICY IF EXISTS "admins edit own draft requests" ON public.corporate_requests;
CREATE POLICY "admins edit requests" ON public.corporate_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND (status = ANY (ARRAY['draft','changes_requested','approved','pending_approval'])))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));