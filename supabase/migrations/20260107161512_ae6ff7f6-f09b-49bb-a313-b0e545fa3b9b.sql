-- Update the calculate_invoice_commission function to use invoice_id instead of order_id
CREATE OR REPLACE FUNCTION public.calculate_invoice_commission()
RETURNS TRIGGER AS $$
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
        
        -- Insert commission record using invoice_id (not order_id)
        -- Check if commission already exists for this invoice and user
        INSERT INTO public.commissions (invoice_id, order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, NEW.order_id, v_user_id, v_commission_amount, v_commission_percentage, 'sales')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;