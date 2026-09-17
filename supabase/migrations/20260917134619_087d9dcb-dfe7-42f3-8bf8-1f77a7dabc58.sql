-- commissions: no direct client inserts (created by triggers)
DROP POLICY IF EXISTS "System can create commissions" ON public.commissions;
CREATE POLICY "Finance can create commissions" ON public.commissions
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- notifications
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'designer'::app_role)
  OR has_role(auth.uid(), 'print_operator'::app_role)
);

DROP POLICY IF EXISTS "System can update notifications" ON public.notifications;
CREATE POLICY "Recipients and admins can update notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (recipient_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (recipient_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- order_history: actor must be self (or admin)
DROP POLICY IF EXISTS "System can insert history" ON public.order_history;
CREATE POLICY "Users can insert their own history entries" ON public.order_history
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- order_comments: only involved staff / oversight roles
DROP POLICY IF EXISTS "Users can view order comments" ON public.order_comments;
CREATE POLICY "Involved staff can view order comments" ON public.order_comments
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'board'::app_role)
  OR has_role(auth.uid(), 'auditor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_comments.order_id
      AND (o.salesperson_id = auth.uid() OR o.designer_id = auth.uid()
           OR o.print_operator_id = auth.uid() OR o.owner_id = auth.uid())
  )
);

-- order_files: mirror storage bucket scoping
DROP POLICY IF EXISTS "Authenticated users can view order files" ON public.order_files;
CREATE POLICY "Involved staff can view order files" ON public.order_files
FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'board'::app_role)
  OR has_role(auth.uid(), 'print_operator'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_files.order_id
      AND (o.salesperson_id = auth.uid() OR o.designer_id = auth.uid()
           OR o.print_operator_id = auth.uid() OR o.owner_id = auth.uid())
  )
);

-- storage: lead-files uploads limited to staff roles
DROP POLICY IF EXISTS "Authenticated can upload lead files bucket" ON storage.objects;
CREATE POLICY "Staff can upload lead files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lead-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'designer'::app_role)
    OR has_role(auth.uid(), 'print_operator'::app_role)
  )
);

-- storage: request-files uploads limited to staff roles
DROP POLICY IF EXISTS "Designers can upload to request-files" ON storage.objects;
CREATE POLICY "Staff can upload request files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'request-files'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'designer'::app_role)
    OR has_role(auth.uid(), 'print_operator'::app_role)
  )
);

-- internal helpers not callable by signed-in users
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_payment_status(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_draft_invoice_number() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role_text(uuid, text) FROM anon, authenticated, PUBLIC;