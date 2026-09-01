REVOKE ALL ON FUNCTION public.auto_manage_fiscal_year() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_annual_shareholder_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_manage_fiscal_year() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_annual_shareholder_report() TO service_role;