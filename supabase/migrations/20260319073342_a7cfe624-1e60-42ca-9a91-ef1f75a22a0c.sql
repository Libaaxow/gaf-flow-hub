
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  invoice_num TEXT;
BEGIN
  -- Get the highest invoice number from both inv- and INV- patterns
  SELECT COALESCE(
    GREATEST(
      (SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[iI][nN][vV]-(\d+)') AS INTEGER)), 6444) FROM public.invoices WHERE invoice_number ~* '^inv-\d+$'),
      6444
    ), 6444) + 1
  INTO next_num;
  
  -- Format as inv-XXXXX
  invoice_num := 'inv-' || next_num::TEXT;
  
  RETURN invoice_num;
END;
$function$;
