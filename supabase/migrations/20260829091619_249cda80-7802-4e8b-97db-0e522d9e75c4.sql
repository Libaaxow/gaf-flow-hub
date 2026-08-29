CREATE TABLE public.company_liabilities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  vendor_name text,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_liabilities TO authenticated;
GRANT ALL ON public.company_liabilities TO service_role;

ALTER TABLE public.company_liabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff can view liabilities"
ON public.company_liabilities FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'board'));

CREATE POLICY "Finance staff can insert liabilities"
ON public.company_liabilities FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "Finance staff can update liabilities"
ON public.company_liabilities FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "Finance staff can delete liabilities"
ON public.company_liabilities FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

CREATE TRIGGER update_company_liabilities_updated_at
BEFORE UPDATE ON public.company_liabilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();