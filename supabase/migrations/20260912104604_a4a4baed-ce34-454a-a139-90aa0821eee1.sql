REVOKE ALL ON FUNCTION public.post_liability_payment_expense() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_vendor_bill_on_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_liability_payment_expense() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_vendor_bill_on_payment() TO service_role;