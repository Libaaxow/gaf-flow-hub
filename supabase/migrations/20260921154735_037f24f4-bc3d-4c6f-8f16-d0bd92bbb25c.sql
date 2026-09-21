CREATE TABLE public.sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  audience text NOT NULL DEFAULT 'all_active',
  audience_days integer,
  total_recipients integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_delivered integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_campaigns TO authenticated;
GRANT ALL ON public.sms_campaigns TO service_role;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and accountants manage campaigns" ON public.sms_campaigns
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Staff can view campaigns" ON public.sms_campaigns
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'board')
);

CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'marketing',
  status text NOT NULL DEFAULT 'queued',
  provider_sid text,
  error_message text,
  segments integer NOT NULL DEFAULT 1,
  cost numeric NOT NULL DEFAULT 0,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_messages_campaign ON public.sms_messages(campaign_id);
CREATE INDEX idx_sms_messages_created ON public.sms_messages(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and accountants manage sms messages" ON public.sms_messages
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Staff can view sms messages" ON public.sms_messages
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'board')
);

CREATE TRIGGER update_sms_campaigns_updated_at BEFORE UPDATE ON public.sms_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sms_messages_updated_at BEFORE UPDATE ON public.sms_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();