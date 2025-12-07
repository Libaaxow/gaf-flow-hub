-- Create vendors table
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add vendor_id to expenses table
ALTER TABLE public.expenses ADD COLUMN vendor_id UUID REFERENCES public.vendors(id);

-- Enable RLS on vendors
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- RLS policies for vendors
CREATE POLICY "Authenticated users can view vendors"
ON public.vendors FOR SELECT
USING (true);

CREATE POLICY "Accountants and admins can insert vendors"
ON public.vendors FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants and admins can update vendors"
ON public.vendors FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete vendors"
ON public.vendors FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Board can view all vendors"
ON public.vendors FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Function to generate vendor code
CREATE OR REPLACE FUNCTION public.generate_vendor_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  vendor_code TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(vendor_code FROM 'VEN-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.vendors
  WHERE vendor_code ~ '^VEN-\d+$';
  
  vendor_code := 'VEN-' || LPAD(next_num::TEXT, 4, '0');
  
  RETURN vendor_code;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_vendors_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();