-- Update notify_on_order_change to notify accountant at correct stages
CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accountant_id UUID;
  accountant_name TEXT;
  designer_name TEXT;
  print_operator_id UUID;
  print_operator_name TEXT;
  customer_name TEXT;
  order_title TEXT;
BEGIN
  -- Get order details
  SELECT c.name, o.job_title INTO customer_name, order_title
  FROM public.orders o
  JOIN public.customers c ON c.id = o.customer_id
  WHERE o.id = NEW.id;

  -- Find an accountant and get their name
  SELECT ur.user_id, p.full_name INTO accountant_id, accountant_name
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'accountant'
  LIMIT 1;

  -- NEW ORDER CREATED (by sales) - Notify accountant
  IF TG_OP = 'INSERT' THEN
    IF accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'Hi ' || accountant_name || ', new order created: ' || order_title || ' for customer: ' || customer_name || '. Please review and approve.',
        NEW.id
      );
    END IF;

  -- ORDER STATUS CHANGED
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- Status changed to 'designing' (accountant approved) - Notify designer
    IF NEW.status = 'designing' AND NEW.designer_id IS NOT NULL THEN
      -- Get designer's name
      SELECT full_name INTO designer_name
      FROM public.profiles
      WHERE id = NEW.designer_id;
      
      PERFORM public.send_whatsapp_notification(
        NEW.designer_id,
        'Hi ' || designer_name || ', you have been assigned to design order: ' || order_title || ' for customer: ' || customer_name,
        NEW.id
      );
    
    -- Status changed to 'ready_for_print' (designer done) - Notify accountant
    ELSIF NEW.status = 'ready_for_print' AND accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'Hi ' || accountant_name || ', design completed for order: ' || order_title || '. Ready for printing approval.',
        NEW.id
      );
    
    -- Status changed to 'printing' (accountant approved for print) - Notify print operator
    ELSIF NEW.status = 'printing' THEN
      SELECT ur.user_id, p.full_name INTO print_operator_id, print_operator_name
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'print_operator'
      LIMIT 1;
      
      IF print_operator_id IS NOT NULL THEN
        PERFORM public.send_whatsapp_notification(
          print_operator_id,
          'Hi ' || print_operator_name || ', new print job ready: ' || order_title || ' for customer: ' || customer_name,
          NEW.id
        );
      END IF;
    
    -- Status changed to 'ready_for_collection' (print operator done) - Notify accountant
    ELSIF NEW.status = 'ready_for_collection' AND accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'Hi ' || accountant_name || ', order ready for collection: ' || order_title || ' for customer: ' || customer_name || '. Please finalize.',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;