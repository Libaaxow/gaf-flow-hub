-- 1. Allow the role-check function to be executed by not-yet-authenticated callers
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO anon;

-- 2. Marketing role can manage SMS campaigns and message logs
DROP POLICY IF EXISTS "Admins and accountants manage campaigns" ON public.sms_campaigns;
CREATE POLICY "Admins, accountants and marketing manage campaigns" ON public.sms_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'marketing'));

DROP POLICY IF EXISTS "Admins and accountants manage messages" ON public.sms_messages;
CREATE POLICY "Admins, accountants and marketing manage messages" ON public.sms_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'marketing'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'marketing'));

-- 3. All signed-in staff can read the activity log (non-sensitive audit trail of orders/leads)
DROP POLICY IF EXISTS "Staff can view activity log" ON public.activity_log;
CREATE POLICY "Staff can view activity log" ON public.activity_log
  FOR SELECT TO authenticated
  USING (true);
