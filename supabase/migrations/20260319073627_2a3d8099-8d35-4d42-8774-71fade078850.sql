
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  max_num INTEGER;
  invoice_num TEXT;
BEGIN
  -- Find the highest number from existing inv- invoices
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[iI][nN][vV]-(\d+)') AS INTEGER)), 6444)
  INTO max_num
  FROM public.invoices
  WHERE invoice_number ~* '^inv-\d+$';

  -- Ensure we never go below 6445
  IF max_num < 6444 THEN
    max_num := 6444;
  END IF;

  invoice_num := 'inv-' || (max_num + 1)::TEXT;
  
  RETURN invoice_num;
END;
$function$;
