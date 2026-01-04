-- Create function to calculate commissions from invoices
CREATE OR REPLACE FUNCTION public.calculate_invoice_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_commission_percentage DECIMAL(5,2);
  v_commission_amount DECIMAL(10,2);
  v_user_id UUID;
BEGIN
  -- Only calculate commissions when invoice status changes to 'paid'
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    
    -- Determine the user who should get commission (prefer draft_by_sales, then created_by)
    v_user_id := COALESCE(NEW.draft_by_sales, NEW.created_by);
    
    -- Only proceed if we have a user and an amount
    IF v_user_id IS NOT NULL AND NEW.total_amount > 0 THEN
      
      -- Get user's commission percentage
      SELECT commission_percentage INTO v_commission_percentage
      FROM public.profiles
      WHERE id = v_user_id;
      
      v_commission_percentage := COALESCE(v_commission_percentage, 0);
      
      IF v_commission_percentage > 0 THEN
        v_commission_amount := NEW.total_amount * (v_commission_percentage / 100);
        
        -- Insert or update commission record (using invoice_id in order_id field for now)
        -- We use 'sales' as commission_type for invoice-based commissions
        INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, v_user_id, v_commission_amount, v_commission_percentage, 'sales')
        ON CONFLICT (order_id, commission_type) DO UPDATE
        SET commission_amount = v_commission_amount,
            commission_percentage = v_commission_percentage,
            user_id = v_user_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on invoices table
DROP TRIGGER IF EXISTS trg_calculate_commission_on_invoices ON public.invoices;

CREATE TRIGGER trg_calculate_commission_on_invoices
AFTER INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.calculate_invoice_commission();