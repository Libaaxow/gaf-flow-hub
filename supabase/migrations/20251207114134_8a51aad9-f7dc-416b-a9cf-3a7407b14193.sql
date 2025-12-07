-- Create quotation_status enum
DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'approved', 'converted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'percentage', -- 'percentage' or 'fixed'
  discount_value NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status quotation_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  terms TEXT,
  converted_invoice_id UUID REFERENCES public.invoices(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation_items table
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotations
CREATE POLICY "Accountants and admins can view all quotations"
ON public.quotations FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can insert quotations"
ON public.quotations FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can update quotations"
ON public.quotations FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete quotations"
ON public.quotations FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for quotation_items
CREATE POLICY "Accountants and admins can view quotation items"
ON public.quotation_items FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can insert quotation items"
ON public.quotation_items FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can update quotation items"
ON public.quotation_items FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can delete quotation items"
ON public.quotation_items FOR DELETE
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Board can view quotations (read-only)
CREATE POLICY "Board can view all quotations"
ON public.quotations FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

CREATE POLICY "Board can view quotation items"
ON public.quotation_items FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Create function to generate quotation number
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_num INTEGER;
  quotation_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'QUO-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.quotations
  WHERE quotation_number ~ '^QUO-\d+$';
  
  quotation_num := 'QUO-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN quotation_num;
END;
$function$;

-- Create trigger for updated_at
CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();