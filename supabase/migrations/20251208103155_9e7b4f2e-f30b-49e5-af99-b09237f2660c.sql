-- Allow draft invoices to have temporary/placeholder invoice numbers
-- The accountant will update the invoice number when approving

-- Add a draft_by_sales column to track sales-created draft invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS draft_by_sales uuid REFERENCES public.profiles(id);

-- Add a is_draft column to identify draft invoices pending accountant review
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT false;

-- Add policy for sales to create draft invoices
CREATE POLICY "Sales can create draft invoices" 
ON public.invoices 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) AND 
  is_draft = true AND 
  draft_by_sales = auth.uid()
);

-- Add policy for sales to view their own draft invoices
CREATE POLICY "Sales can view their draft invoices" 
ON public.invoices 
FOR SELECT 
USING (
  has_role(auth.uid(), 'sales'::app_role) AND 
  draft_by_sales = auth.uid()
);

-- Add policy for sales to insert invoice items for their draft invoices
CREATE POLICY "Sales can insert invoice items for their drafts" 
ON public.invoice_items 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'sales'::app_role) AND 
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE id = invoice_id 
    AND is_draft = true 
    AND draft_by_sales = auth.uid()
  )
);

-- Add policy for sales to view invoice items for their draft invoices
CREATE POLICY "Sales can view invoice items for their drafts" 
ON public.invoice_items 
FOR SELECT 
USING (
  has_role(auth.uid(), 'sales'::app_role) AND 
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE id = invoice_id 
    AND draft_by_sales = auth.uid()
  )
);

-- Function to generate a temporary draft invoice number
CREATE OR REPLACE FUNCTION public.generate_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  draft_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'DRAFT-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number ~ '^DRAFT-\d+$';
  
  draft_num := 'DRAFT-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN draft_num;
END;
$$;