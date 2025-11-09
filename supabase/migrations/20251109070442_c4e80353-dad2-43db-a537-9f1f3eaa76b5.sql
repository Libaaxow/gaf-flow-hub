-- Fix search_path for calculate_commission function
DROP FUNCTION IF EXISTS public.calculate_commission() CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_commission_percentage DECIMAL(5,2);
  v_commission_amount DECIMAL(10,2);
BEGIN
  -- Only calculate if order has value and salesperson
  IF NEW.order_value > 0 AND NEW.salesperson_id IS NOT NULL THEN
    -- Get salesperson commission percentage
    SELECT commission_percentage INTO v_commission_percentage
    FROM public.profiles
    WHERE id = NEW.salesperson_id;
    
    v_commission_percentage := COALESCE(v_commission_percentage, 0);
    v_commission_amount := NEW.order_value * (v_commission_percentage / 100);
    
    -- Insert or update commission record
    INSERT INTO public.commissions (order_id, salesperson_id, commission_amount, commission_percentage)
    VALUES (NEW.id, NEW.salesperson_id, v_commission_amount, v_commission_percentage)
    ON CONFLICT (order_id) DO UPDATE
    SET commission_amount = v_commission_amount,
        commission_percentage = v_commission_percentage;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER calculate_order_commission
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.calculate_commission();

-- Fix search_path for log_order_change function
DROP FUNCTION IF EXISTS public.log_order_change() CASCADE;
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  action_text TEXT;
  change_details JSONB;
BEGIN
  -- Determine the action based on what changed
  IF TG_OP = 'INSERT' THEN
    action_text := 'Order Created';
    change_details := jsonb_build_object(
      'order_value', NEW.order_value,
      'status', NEW.status,
      'customer_id', NEW.customer_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    change_details := jsonb_build_object();
    
    IF OLD.designer_id IS DISTINCT FROM NEW.designer_id THEN
      action_text := 'Designer Assigned';
      change_details := jsonb_build_object(
        'old_designer_id', OLD.designer_id,
        'new_designer_id', NEW.designer_id
      );
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      action_text := 'Status Changed';
      change_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.new_status
      );
    ELSIF OLD.order_value IS DISTINCT FROM NEW.order_value THEN
      action_text := 'Order Value Updated';
      change_details := jsonb_build_object(
        'old_value', OLD.order_value,
        'new_value', NEW.order_value
      );
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      action_text := 'Payment Status Changed';
      change_details := jsonb_build_object(
        'old_status', OLD.payment_status,
        'new_status', NEW.payment_status
      );
    ELSE
      action_text := 'Order Updated';
      change_details := jsonb_build_object('updated_fields', 'various');
    END IF;
  END IF;

  -- Insert into history
  INSERT INTO public.order_history (order_id, user_id, action, details)
  VALUES (NEW.id, auth.uid(), action_text, change_details);

  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER track_order_changes
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_change();