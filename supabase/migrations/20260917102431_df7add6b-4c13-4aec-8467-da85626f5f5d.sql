-- 1. Activity log: restrict to oversight roles
DROP POLICY IF EXISTS "Authenticated read activity_log" ON public.activity_log;
CREATE POLICY "Oversight roles read activity_log" ON public.activity_log
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
  OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor')
  OR actor_id = auth.uid()
);

-- 2. Customers: restrict to roles that need customer data
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
CREATE POLICY "Staff roles can view customers" ON public.customers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
  OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'marketing')
  OR has_role(auth.uid(),'designer') OR has_role(auth.uid(),'print_operator')
  OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor')
);

-- 3. Employees: salaries only for admin/accountant, plus own record
DROP POLICY IF EXISTS "Authenticated can view employees" ON public.employees;
CREATE POLICY "HR roles or self can view employees" ON public.employees
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
  OR profile_id = auth.uid()
);

-- 4. Invoices: financial roles only (sales drafts policy remains)
DROP POLICY IF EXISTS "All authenticated users can view invoices" ON public.invoices;
CREATE POLICY "Financial roles can view invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
  OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor')
  OR has_role(auth.uid(),'sales')
);

-- 5. Profiles: full row only for self and admin/accountant/board; names via view
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Self or管理 roles can view profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid() OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board')
);

CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = false) AS
SELECT id, full_name, avatar_url FROM public.profiles;

GRANT SELECT ON public.staff_directory TO authenticated;

-- 6. Settings tables
DROP POLICY IF EXISTS "Authenticated users can view tax settings" ON public.tax_settings;
CREATE POLICY "Finance roles can view tax settings" ON public.tax_settings
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "Authenticated can view integration settings" ON public.integration_settings;
CREATE POLICY "Admins can view integration settings" ON public.integration_settings
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'));

-- 7. Vendor / purchasing data: finance roles only
DROP POLICY IF EXISTS "Authenticated users can view vendors" ON public.vendors;
CREATE POLICY "Finance roles can view vendors" ON public.vendors
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

DROP POLICY IF EXISTS "Authenticated users can view vendor bills" ON public.vendor_bills;
CREATE POLICY "Finance roles can view vendor bills" ON public.vendor_bills
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

DROP POLICY IF EXISTS "Authenticated users can view vendor payments" ON public.vendor_payments;
CREATE POLICY "Finance roles can view vendor payments" ON public.vendor_payments
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

DROP POLICY IF EXISTS "Authenticated users can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Finance roles can view purchase orders" ON public.purchase_orders
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

DROP POLICY IF EXISTS "Authenticated users can view purchase order items" ON public.purchase_order_items;
CREATE POLICY "Finance roles can view purchase order items" ON public.purchase_order_items
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

DROP POLICY IF EXISTS "Authenticated users can view product vendors" ON public.product_vendors;
CREATE POLICY "Finance roles can view product vendors" ON public.product_vendors
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'auditor'));

-- 8. Storage: order-files scoped to involved staff, ownership for writes
DROP POLICY IF EXISTS "Authenticated users can view order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can download order files" ON storage.objects;
CREATE POLICY "Involved staff can read order files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'order-files' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
    OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'print_operator')
    OR owner = auth.uid()
    OR (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM public.orders o
      WHERE o.salesperson_id = auth.uid() OR o.designer_id = auth.uid() OR o.print_operator_id = auth.uid() OR o.owner_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can update their own uploads" ON storage.objects;
CREATE POLICY "Owners or admins can update order files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'order-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'order-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')));

DROP POLICY IF EXISTS "Admins can delete order files" ON storage.objects;
CREATE POLICY "Admins can delete order files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'order-files' AND has_role(auth.uid(),'admin'));

-- 9. Storage: request-files and lead-files scoped by role/ownership
DROP POLICY IF EXISTS "Authenticated users can view request-files" ON storage.objects;
CREATE POLICY "Involved staff can read request files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'request-files' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
    OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'print_operator')
    OR has_role(auth.uid(),'designer')
    OR owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.request_files rf WHERE rf.file_path = storage.objects.name AND rf.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated can read lead files bucket" ON storage.objects;
CREATE POLICY "Involved staff can read lead files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lead-files' AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')
    OR has_role(auth.uid(),'board') OR has_role(auth.uid(),'designer')
    OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'print_operator')
    OR owner = auth.uid()
  )
);

-- 10. SECURITY DEFINER functions: revoke direct API execution where not needed
REVOKE EXECUTE ON FUNCTION public.process_daily_salary_credits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_pending_notifications() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_pending_whatsapp_notifications() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_annual_shareholder_report() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_whatsapp_notification(uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_manage_fiscal_year() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_corporate_reference(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_draft_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_po_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_product_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_quotation_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_bill_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_payment_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role_text(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_corporate_viewer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_payment_status(uuid) FROM anon;