
CREATE TABLE public.company_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage company assets"
  ON public.company_assets FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Board can view company assets"
  ON public.company_assets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'board'::app_role));

CREATE POLICY "Accountants can view company assets"
  ON public.company_assets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'accountant'::app_role));
