
CREATE TABLE public.fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_label text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  closing_net_worth numeric(14,2),
  reserve_amount numeric(14,2),
  distributed_amount numeric(14,2),
  closing_notes text,
  reserve_asset_id uuid REFERENCES public.company_assets(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fiscal years" ON public.fiscal_years FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Finance can view fiscal years" ON public.fiscal_years FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'board'));

CREATE TRIGGER update_fiscal_years_updated_at BEFORE UPDATE ON public.fiscal_years
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.share_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid REFERENCES public.fiscal_years(id) ON DELETE SET NULL,
  shareholder_id uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  document_path text,
  document_name text,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  previous_percentage numeric(6,3),
  new_percentage numeric(6,3),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_change_requests TO authenticated;
GRANT ALL ON public.share_change_requests TO service_role;
ALTER TABLE public.share_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage share change requests" ON public.share_change_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Finance can view share change requests" ON public.share_change_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'board'));

CREATE TRIGGER update_share_change_requests_updated_at BEFORE UPDATE ON public.share_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Finance read shareholder documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'shareholder-documents' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'board')));
CREATE POLICY "Admins upload shareholder documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'shareholder-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete shareholder documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'shareholder-documents' AND public.has_role(auth.uid(), 'admin'));
