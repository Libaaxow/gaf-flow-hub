
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY['new'::text, 'converted'::text, 'lost'::text, 'sent_to_finance'::text, 'processed'::text]));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quantity numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS amount numeric;
