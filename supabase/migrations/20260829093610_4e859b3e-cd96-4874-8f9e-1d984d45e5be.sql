CREATE TABLE public.company_liability_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  liability_id uuid NOT NULL REFERENCES public.company_liabilities(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_liability_items TO authenticated;
GRANT ALL ON public.company_liability_items TO service_role;

ALTER TABLE public.company_liability_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accountants and admins manage liability items"
ON public.company_liability_items FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Board can view liability items"
ON public.company_liability_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'board'));

CREATE INDEX idx_company_liability_items_liability_id ON public.company_liability_items(liability_id);

CREATE TRIGGER update_company_liability_items_updated_at
BEFORE UPDATE ON public.company_liability_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();