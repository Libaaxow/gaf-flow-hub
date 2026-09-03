REVOKE ALL ON FUNCTION public.post_liability_payment_expense() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_liability_payment_expense() TO service_role;