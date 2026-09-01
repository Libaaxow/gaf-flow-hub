-- 1. Auditor role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

-- helper (text comparison so it works without enum literal in this tx)
CREATE OR REPLACE FUNCTION public.has_role_text(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_corporate_viewer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','board','accountant','auditor')
  )
$$;

-- 2. Extend shareholders into a share register
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS shareholder_code text,
  ADD COLUMN IF NOT EXISTS shares_owned numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_class text NOT NULL DEFAULT 'ordinary',
  ADD COLUMN IF NOT EXISTS par_value numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paid_up_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_acquired date,
  ADD COLUMN IF NOT EXISTS certificate_number text;

-- 3. Company share / corporate settings (single row)
CREATE TABLE IF NOT EXISTS public.corporate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'GAF Media',
  registration_number text,
  incorporation_date date,
  currency text NOT NULL DEFAULT 'USD',
  authorized_shares numeric NOT NULL DEFAULT 0,
  par_value numeric NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.corporate_settings TO authenticated;
GRANT ALL ON public.corporate_settings TO service_role;
ALTER TABLE public.corporate_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read settings" ON public.corporate_settings FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins insert settings" ON public.corporate_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update settings" ON public.corporate_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Corporate requests
CREATE TABLE IF NOT EXISTS public.corporate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text NOT NULL UNIQUE,
  request_type text NOT NULL,
  title text NOT NULL,
  description text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid,
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_comment text,
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.corporate_requests TO authenticated;
GRANT ALL ON public.corporate_requests TO service_role;
ALTER TABLE public.corporate_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read requests" ON public.corporate_requests FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins create requests" ON public.corporate_requests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND prepared_by = auth.uid());
CREATE POLICY "admins edit own draft requests" ON public.corporate_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND status IN ('draft','changes_requested','approved'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "board decides requests" ON public.corporate_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'board') AND status IN ('pending_approval','changes_requested'))
  WITH CHECK (public.has_role(auth.uid(),'board'));

CREATE TRIGGER corporate_requests_updated_at BEFORE UPDATE ON public.corporate_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- reference number generator
CREATE OR REPLACE FUNCTION public.generate_corporate_reference(_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference_no FROM '[0-9]+$') AS integer)), 0) + 1
    INTO n FROM public.corporate_requests WHERE reference_no LIKE _prefix || '-%';
  RETURN _prefix || '-' || LPAD(n::text, 5, '0');
END;
$$;

-- 5. Request documents
CREATE TABLE IF NOT EXISTS public.corporate_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.corporate_requests(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  document_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.corporate_request_documents TO authenticated;
GRANT ALL ON public.corporate_request_documents TO service_role;
ALTER TABLE public.corporate_request_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read docs" ON public.corporate_request_documents FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins upload docs" ON public.corporate_request_documents FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. Share transactions history
CREATE TABLE IF NOT EXISTS public.share_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.corporate_requests(id) ON DELETE SET NULL,
  shareholder_id uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  counterparty_id uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  transaction_type text NOT NULL,
  shares_delta numeric NOT NULL DEFAULT 0,
  price_per_share numeric,
  amount numeric,
  shares_before numeric,
  shares_after numeric,
  percentage_before numeric,
  percentage_after numeric,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.share_transactions TO authenticated;
GRANT ALL ON public.share_transactions TO service_role;
ALTER TABLE public.share_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read share tx" ON public.share_transactions FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins insert share tx" ON public.share_transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. Dividends
CREATE TABLE IF NOT EXISTS public.dividend_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.corporate_requests(id) ON DELETE SET NULL,
  reference_no text NOT NULL,
  profit_available numeric NOT NULL DEFAULT 0,
  dividend_amount numeric NOT NULL DEFAULT 0,
  dividend_per_share numeric NOT NULL DEFAULT 0,
  declaration_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_date date,
  status text NOT NULL DEFAULT 'pending_approval',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dividend_declarations TO authenticated;
GRANT ALL ON public.dividend_declarations TO service_role;
ALTER TABLE public.dividend_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read dividends" ON public.dividend_declarations FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins manage dividends" ON public.dividend_declarations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update dividends" ON public.dividend_declarations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER dividend_declarations_updated_at BEFORE UPDATE ON public.dividend_declarations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.dividend_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id uuid NOT NULL REFERENCES public.dividend_declarations(id) ON DELETE CASCADE,
  shareholder_id uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  shares numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dividend_entitlements TO authenticated;
GRANT ALL ON public.dividend_entitlements TO service_role;
ALTER TABLE public.dividend_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read entitlements" ON public.dividend_entitlements FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins insert entitlements" ON public.dividend_entitlements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update entitlements" ON public.dividend_entitlements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 8. Compliance
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'filing',
  authority text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference_no text,
  notes text,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.compliance_items TO authenticated;
GRANT ALL ON public.compliance_items TO service_role;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read compliance" ON public.compliance_items FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "admins manage compliance" ON public.compliance_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update compliance" ON public.compliance_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER compliance_items_updated_at BEFORE UPDATE ON public.compliance_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Immutable corporate audit log
CREATE TABLE IF NOT EXISTS public.corporate_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  reference_no text,
  action text NOT NULL,
  actor_id uuid,
  actor_role text,
  previous_value jsonb,
  new_value jsonb,
  approval_status text,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.corporate_audit_log TO authenticated;
GRANT ALL ON public.corporate_audit_log TO service_role;
ALTER TABLE public.corporate_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corporate viewers read audit" ON public.corporate_audit_log FOR SELECT TO authenticated USING (public.is_corporate_viewer(auth.uid()));
CREATE POLICY "authenticated append audit" ON public.corporate_audit_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- auto audit for corporate_requests
CREATE OR REPLACE FUNCTION public.log_corporate_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text; v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    v_action := 'request_created';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'status_' || NEW.status;
  ELSE
    v_action := 'request_updated';
  END IF;
  INSERT INTO public.corporate_audit_log(entity_type, entity_id, reference_no, action, actor_id, actor_role, previous_value, new_value, approval_status, comments)
  VALUES ('corporate_request', NEW.id, NEW.reference_no, v_action, auth.uid(), v_role,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), NEW.status, NEW.decision_comment);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tg_corporate_requests_audit AFTER INSERT OR UPDATE ON public.corporate_requests
FOR EACH ROW EXECUTE FUNCTION public.log_corporate_request_change();

-- seed settings row
INSERT INTO public.corporate_settings (company_name)
SELECT 'GAF Media' WHERE NOT EXISTS (SELECT 1 FROM public.corporate_settings);