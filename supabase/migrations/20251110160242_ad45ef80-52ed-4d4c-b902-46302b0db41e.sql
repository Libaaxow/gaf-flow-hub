-- Add commission support for designers and print operators

-- First, add a commission_type column to track what type of commission this is
ALTER TABLE public.commissions
ADD COLUMN commission_type text NOT NULL DEFAULT 'sales' CHECK (commission_type IN ('sales', 'design', 'print'));

-- Rename salesperson_id to user_id to make it more generic
ALTER TABLE public.commissions
RENAME COLUMN salesperson_id TO user_id;

-- Update the commission calculation function to handle all roles
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sales_commission_percentage DECIMAL(5,2);
  v_sales_commission_amount DECIMAL(10,2);
  v_designer_commission_percentage DECIMAL(5,2);
  v_designer_commission_amount DECIMAL(10,2);
  v_print_commission_percentage DECIMAL(5,2);
  v_print_commission_amount DECIMAL(10,2);
BEGIN
  -- Calculate sales commission if order has value and salesperson
  IF NEW.order_value > 0 AND NEW.salesperson_id IS NOT NULL THEN
    -- Get salesperson commission percentage
    SELECT commission_percentage INTO v_sales_commission_percentage
    FROM public.profiles
    WHERE id = NEW.salesperson_id;
    
    v_sales_commission_percentage := COALESCE(v_sales_commission_percentage, 0);
    v_sales_commission_amount := NEW.order_value * (v_sales_commission_percentage / 100);
    
    -- Insert or update sales commission record
    INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
    VALUES (NEW.id, NEW.salesperson_id, v_sales_commission_amount, v_sales_commission_percentage, 'sales')
    ON CONFLICT (order_id, commission_type) DO UPDATE
    SET commission_amount = v_sales_commission_amount,
        commission_percentage = v_sales_commission_percentage,
        user_id = NEW.salesperson_id;
  END IF;
  
  -- Calculate designer commission if designer is assigned
  IF NEW.order_value > 0 AND NEW.designer_id IS NOT NULL THEN
    -- Get designer commission percentage
    SELECT commission_percentage INTO v_designer_commission_percentage
    FROM public.profiles
    WHERE id = NEW.designer_id;
    
    v_designer_commission_percentage := COALESCE(v_designer_commission_percentage, 0);
    v_designer_commission_amount := NEW.order_value * (v_designer_commission_percentage / 100);
    
    -- Insert or update designer commission record
    INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
    VALUES (NEW.id, NEW.designer_id, v_designer_commission_amount, v_designer_commission_percentage, 'design')
    ON CONFLICT (order_id, commission_type) DO UPDATE
    SET commission_amount = v_designer_commission_amount,
        commission_percentage = v_designer_commission_percentage,
        user_id = NEW.designer_id;
  END IF;
  
  -- Calculate print operator commission when status is printing or later
  IF NEW.order_value > 0 AND NEW.status IN ('printing', 'printed', 'ready_for_collection', 'completed') THEN
    -- Find a print operator (we'll use the first one)
    DECLARE
      v_print_operator_id UUID;
    BEGIN
      SELECT user_id INTO v_print_operator_id
      FROM public.user_roles
      WHERE role = 'print_operator'
      LIMIT 1;
      
      IF v_print_operator_id IS NOT NULL THEN
        -- Get print operator commission percentage
        SELECT commission_percentage INTO v_print_commission_percentage
        FROM public.profiles
        WHERE id = v_print_operator_id;
        
        v_print_commission_percentage := COALESCE(v_print_commission_percentage, 0);
        v_print_commission_amount := NEW.order_value * (v_print_commission_percentage / 100);
        
        -- Insert or update print commission record
        INSERT INTO public.commissions (order_id, user_id, commission_amount, commission_percentage, commission_type)
        VALUES (NEW.id, v_print_operator_id, v_print_commission_amount, v_print_commission_percentage, 'print')
        ON CONFLICT (order_id, commission_type) DO UPDATE
        SET commission_amount = v_print_commission_amount,
            commission_percentage = v_print_commission_percentage,
            user_id = v_print_operator_id;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update the unique constraint to include commission_type
ALTER TABLE public.commissions
DROP CONSTRAINT IF EXISTS commissions_order_id_key;

ALTER TABLE public.commissions
ADD CONSTRAINT commissions_order_commission_type_key UNIQUE (order_id, commission_type);

-- Update RLS policies to use user_id instead of salesperson_id
DROP POLICY IF EXISTS "Users can view their own commissions" ON public.commissions;

CREATE POLICY "Users can view their own commissions"
ON public.commissions
FOR SELECT
USING (
  (auth.uid() = user_id) 
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'accountant'::app_role)
);