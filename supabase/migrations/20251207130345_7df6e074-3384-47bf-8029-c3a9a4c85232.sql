-- Fix the generate_vendor_code function with proper table-qualified column reference
CREATE OR REPLACE FUNCTION public.generate_vendor_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    -- Generate a random code like VND-XXXXX
    new_code := 'VND-' || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
    
    -- Check if this code already exists (use table-qualified column name)
    SELECT EXISTS(SELECT 1 FROM public.vendors v WHERE v.vendor_code = new_code) INTO code_exists;
    
    -- If the code doesn't exist, we can use it
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;