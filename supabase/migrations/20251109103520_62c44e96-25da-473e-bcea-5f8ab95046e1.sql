-- Fix search_path for generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_num INTEGER;
  invoice_num TEXT;
BEGIN
  -- Get the highest invoice number
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number ~ '^INV-\d+$';
  
  -- Format as INV-00001
  invoice_num := 'INV-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN invoice_num;
END;
$function$;