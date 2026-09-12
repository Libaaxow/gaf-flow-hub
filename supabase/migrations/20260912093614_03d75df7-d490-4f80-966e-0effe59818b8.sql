ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'contra';

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_contra boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS contra_reference text;
ALTER TABLE public.vendor_payments ADD COLUMN IF NOT EXISTS is_contra boolean NOT NULL DEFAULT false;
ALTER TABLE public.vendor_payments ADD COLUMN IF NOT EXISTS contra_reference text;

CREATE TABLE IF NOT EXISTS public.contra_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  amount numeric(12,2) NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.contra_settlements TO authenticated;
GRANT ALL ON public.contra_settlements TO service_role;

ALTER TABLE public.contra_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can view contra settlements"
ON public.contra_settlements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'board'));

CREATE POLICY "Finance can create contra settlements"
ON public.contra_settlements FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) AND created_by = auth.uid());