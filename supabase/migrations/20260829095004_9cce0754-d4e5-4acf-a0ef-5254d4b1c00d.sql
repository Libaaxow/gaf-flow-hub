GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_liabilities TO authenticated;
GRANT ALL ON public.company_liabilities TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_liability_items TO authenticated;
GRANT ALL ON public.company_liability_items TO service_role;