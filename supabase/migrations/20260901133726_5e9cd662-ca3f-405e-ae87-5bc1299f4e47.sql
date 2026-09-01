REVOKE EXECUTE ON FUNCTION public.has_role_text(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_corporate_viewer(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_corporate_reference(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_corporate_request_change() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_text(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_corporate_viewer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_corporate_reference(text) TO authenticated;