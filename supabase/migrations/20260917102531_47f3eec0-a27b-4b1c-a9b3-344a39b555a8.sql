DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Re-grant only the helpers that must run for signed-in users (RLS policies, number generation)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_corporate_viewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_corporate_reference(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_draft_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_product_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_quotation_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_bill_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_payment_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_payment_status(uuid) TO authenticated;