-- Update the calculate_commission function to use invoice amounts when order is completed
CREATE OR REPLACE FUNCTION public.calculate_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_total DECIMAL(12,2);
  v_sales_commission_percentage DECIMAL(5,2);
  v_sales_commission_amount DECIMAL(10,2);
  v_designer_commission_percentage DECIMAL(5,2);
  v_designer_commission_amount DECIMAL(10,2);
  v_print_commission_percentage DECIMAL(5,2);
  v_print_commission_amount DECIMAL(10,2);
BEGIN
  -- Only calculate commissions when order status changes to 'completed'
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    
    -- Get total amount from invoices linked to this order
    SELECT COALESCE(SUM(total_amount), 0) INTO v_invoice_total
    FROM public.invoices
    WHERE order_id = NEW.id;
    
    -- If no invoices found, use order_value as fallback
    IF v_invoice_total = 0 THEN
      v_invoice_total := COALESCE(NEW.order_value, 0);
    END IF;
    
    -- Only proceed if there's an amount to calculate commission on
    IF v_invoice_total > 0 THEN
      
      -- Calculate sales commission if salesperson assigned
      IF NEW.salesperson_id IS NOT NULL THEN
        SELECT commission_percentage INTO v_sales_commission_percentage
        FROM public.profiles
        WHERE id = NEW.salesperson_id;
        
        v_sales_commission_percentage := COALESCE(v_sales_commission_percentage, 0);
        v_sales_commission_amount := v_invoice_total * (v_sales_commission_percentage / 100);
        
        INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, NEW.salesperson_id, v_sales_commission_amount, v_sales_commission_percentage, 'sales')
        ON CONFLICT (order_id, commission_type) DO UPDATE
        SET commission_amount = v_sales_commission_amount,
            commission_percentage = v_sales_commission_percentage,
            user_id = NEW.salesperson_id;
      END IF;
      
      -- Calculate designer commission if designer assigned
      IF NEW.designer_id IS NOT NULL THEN
        SELECT commission_percentage INTO v_designer_commission_percentage
        FROM public.profiles
        WHERE id = NEW.designer_id;
        
        v_designer_commission_percentage := COALESCE(v_designer_commission_percentage, 0);
        v_designer_commission_amount := v_invoice_total * (v_designer_commission_percentage / 100);
        
        INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, NEW.designer_id, v_designer_commission_amount, v_designer_commission_percentage, 'design')
        ON CONFLICT (order_id, commission_type) DO UPDATE
        SET commission_amount = v_designer_commission_amount,
            commission_percentage = v_designer_commission_percentage,
            user_id = NEW.designer_id;
      END IF;
      
      -- Calculate print operator commission if assigned
      IF NEW.print_operator_id IS NOT NULL THEN
        SELECT commission_percentage INTO v_print_commission_percentage
        FROM public.profiles
        WHERE id = NEW.print_operator_id;
        
        v_print_commission_percentage := COALESCE(v_print_commission_percentage, 0);
        v_print_commission_amount := v_invoice_total * (v_print_commission_percentage / 100);
        
        INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, NEW.print_operator_id, v_print_commission_amount, v_print_commission_percentage, 'print')
        ON CONFLICT (order_id, commission_type) DO UPDATE
        SET commission_amount = v_print_commission_amount,
            commission_percentage = v_print_commission_percentage,
            user_id = NEW.print_operator_id;
      END IF;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;