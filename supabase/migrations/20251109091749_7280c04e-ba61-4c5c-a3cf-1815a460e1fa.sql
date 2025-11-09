-- Fix the log_order_change trigger function
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        'new_status', NEW.status
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