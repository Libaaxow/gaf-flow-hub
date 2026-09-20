CREATE TABLE public.customer_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  agreement_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_price_lists TO authenticated;
GRANT ALL ON public.customer_price_lists TO service_role;
ALTER TABLE public.customer_price_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view agreements" ON public.customer_price_lists
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
  OR has_role(auth.uid(), 'sales') OR has_role(auth.uid(), 'board') OR has_role(auth.uid(), 'auditor')
);
CREATE POLICY "Admin accountant manage agreements" ON public.customer_price_lists
FOR ALL TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
);

CREATE TABLE public.contract_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.customer_price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  custom_price numeric NOT NULL CHECK (custom_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_product_prices TO authenticated;
GRANT ALL ON public.contract_product_prices TO service_role;
ALTER TABLE public.contract_product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view contract prices" ON public.contract_product_prices
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
  OR has_role(auth.uid(), 'sales') OR has_role(auth.uid(), 'board') OR has_role(auth.uid(), 'auditor')
);
CREATE POLICY "Admin accountant manage contract prices" ON public.contract_product_prices
FOR ALL TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
) WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant')
);

CREATE TRIGGER update_customer_price_lists_updated_at
BEFORE UPDATE ON public.customer_price_lists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contract_product_prices_updated_at
BEFORE UPDATE ON public.contract_product_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cpl_customer ON public.customer_price_lists(customer_id);
CREATE INDEX idx_cpp_agreement ON public.contract_product_prices(agreement_id);