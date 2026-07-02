
-- Leads table
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  source text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','converted','lost')),
  owner_id uuid NOT NULL,
  created_by_role app_role,
  assigned_designer_id uuid,
  converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own leads" ON public.leads
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Designer sees leads assigned to them" ON public.leads
  FOR SELECT TO authenticated
  USING (assigned_designer_id = auth.uid());

CREATE POLICY "Sales create leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'designer'))
    AND owner_id = auth.uid()
  );

CREATE POLICY "Finance roles read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'board')
  );

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('lead','order')),
  entity_id uuid NOT NULL,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity_log" ON public.activity_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert activity_log" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id, created_at DESC);

-- Orders: add owner_id + production_stage
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS production_stage text NOT NULL DEFAULT 'not_sent'
    CHECK (production_stage IN ('not_sent','sent_to_production','in_production','completed'));

-- Backfill owner_id from salesperson_id
UPDATE public.orders SET owner_id = COALESCE(salesperson_id, designer_id) WHERE owner_id IS NULL;

-- Backfill production_stage from existing status
UPDATE public.orders SET production_stage = 
  CASE 
    WHEN status IN ('completed','delivered') THEN 'completed'
    WHEN status IN ('printing','ready_for_collection') THEN 'in_production'
    WHEN status IN ('ready_for_print','awaiting_accounting_approval') THEN 'sent_to_production'
    ELSE 'not_sent'
  END;

-- Trigger for lead activity
CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  act text;
  det jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'lead_created';
    det := jsonb_build_object('title', NEW.title, 'owner_id', NEW.owner_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'converted' THEN
      act := 'lead_converted';
      det := jsonb_build_object('order_id', NEW.converted_order_id);
    ELSIF OLD.assigned_designer_id IS DISTINCT FROM NEW.assigned_designer_id THEN
      act := 'designer_assigned';
      det := jsonb_build_object('designer_id', NEW.assigned_designer_id);
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.activity_log(entity_type, entity_id, actor_id, action, details)
  VALUES ('lead', NEW.id, auth.uid(), act, det);
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_leads_activity
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_activity();

-- Trigger for order production_stage activity
CREATE OR REPLACE FUNCTION public.log_order_stage_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log(entity_type, entity_id, actor_id, action, details)
    VALUES ('order', NEW.id, auth.uid(), 'order_created',
      jsonb_build_object('owner_id', NEW.owner_id, 'designer_id', NEW.designer_id));
    RETURN NEW;
  END IF;

  IF OLD.production_stage IS DISTINCT FROM NEW.production_stage THEN
    act := CASE NEW.production_stage
      WHEN 'sent_to_production' THEN 'sent_to_production'
      WHEN 'in_production' THEN 'production_started'
      WHEN 'completed' THEN 'production_completed'
      ELSE 'stage_changed'
    END;
    INSERT INTO public.activity_log(entity_type, entity_id, actor_id, action, details)
    VALUES ('order', NEW.id, auth.uid(), act,
      jsonb_build_object('from', OLD.production_stage, 'to', NEW.production_stage));
  END IF;

  IF OLD.designer_id IS DISTINCT FROM NEW.designer_id AND NEW.designer_id IS NOT NULL THEN
    INSERT INTO public.activity_log(entity_type, entity_id, actor_id, action, details)
    VALUES ('order', NEW.id, auth.uid(), 'designer_assigned',
      jsonb_build_object('designer_id', NEW.designer_id));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_orders_stage_activity
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_stage_activity();
