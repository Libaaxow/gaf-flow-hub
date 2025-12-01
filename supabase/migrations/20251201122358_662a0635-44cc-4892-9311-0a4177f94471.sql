-- Add print_operator_id column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_operator_id uuid REFERENCES public.profiles(id);

-- Drop existing print operator update policy
DROP POLICY IF EXISTS "Print operators can update printing orders" ON public.orders;

-- Create new policy: Print operators can only update their assigned orders
CREATE POLICY "Print operators can update their assigned orders" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'print_operator'::app_role) 
  AND print_operator_id = auth.uid() 
  AND status IN ('ready_for_print', 'printing', 'printed')
)
WITH CHECK (
  has_role(auth.uid(), 'print_operator'::app_role) 
  AND print_operator_id = auth.uid() 
  AND status IN ('printing', 'printed', 'ready_for_collection')
);

-- Update the notify_on_order_change function to handle designer and print operator assignments
CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  accountant_id UUID;
  accountant_name TEXT;
  designer_name TEXT;
  print_operator_name TEXT;
  customer_name TEXT;
  order_title TEXT;
  existing_notification_count INT;
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
      SELECT COUNT(*) INTO existing_notification_count
      FROM public.notifications
      WHERE order_id = NEW.id 
      AND recipient_id = accountant_id
      AND message LIKE '%new order created%'
      AND created_at > NOW() - INTERVAL '1 minute';
      
      IF existing_notification_count = 0 THEN
        PERFORM public.send_whatsapp_notification(
          accountant_id,
          'Hi ' || accountant_name || ', new order created: ' || order_title || ' for customer: ' || customer_name || '. Please review and approve.',
          NEW.id
        );
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    
    -- DESIGNER ASSIGNED - Notify the assigned designer
    IF OLD.designer_id IS DISTINCT FROM NEW.designer_id AND NEW.designer_id IS NOT NULL THEN
      SELECT full_name INTO designer_name
      FROM public.profiles
      WHERE id = NEW.designer_id;
      
      SELECT COUNT(*) INTO existing_notification_count
      FROM public.notifications
      WHERE order_id = NEW.id 
      AND recipient_id = NEW.designer_id
      AND message LIKE '%you have been assigned to design%'
      AND created_at > NOW() - INTERVAL '1 minute';
      
      IF existing_notification_count = 0 THEN
        PERFORM public.send_whatsapp_notification(
          NEW.designer_id,
          'Hi ' || designer_name || ', you have been assigned to design order: ' || order_title || ' for customer: ' || customer_name,
          NEW.id
        );
      END IF;
    END IF;
    
    -- PRINT OPERATOR ASSIGNED - Notify the assigned print operator
    IF OLD.print_operator_id IS DISTINCT FROM NEW.print_operator_id AND NEW.print_operator_id IS NOT NULL THEN
      SELECT full_name INTO print_operator_name
      FROM public.profiles
      WHERE id = NEW.print_operator_id;
      
      SELECT COUNT(*) INTO existing_notification_count
      FROM public.notifications
      WHERE order_id = NEW.id 
      AND recipient_id = NEW.print_operator_id
      AND message LIKE '%you have been assigned to print%'
      AND created_at > NOW() - INTERVAL '1 minute';
      
      IF existing_notification_count = 0 THEN
        PERFORM public.send_whatsapp_notification(
          NEW.print_operator_id,
          'Hi ' || print_operator_name || ', you have been assigned to print order: ' || order_title || ' for customer: ' || customer_name,
          NEW.id
        );
      END IF;
    END IF;

    -- STATUS CHANGES
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      
      -- Status changed to 'awaiting_accounting_approval' or 'ready_for_print' (designer done)
      IF NEW.status IN ('awaiting_accounting_approval', 'ready_for_print') AND accountant_id IS NOT NULL THEN
        SELECT COUNT(*) INTO existing_notification_count
        FROM public.notifications
        WHERE order_id = NEW.id 
        AND recipient_id = accountant_id
        AND message LIKE '%design completed%'
        AND created_at > NOW() - INTERVAL '1 minute';
        
        IF existing_notification_count = 0 THEN
          PERFORM public.send_whatsapp_notification(
            accountant_id,
            'Hi ' || accountant_name || ', design completed for order: ' || order_title || '. Ready for printing approval.',
            NEW.id
          );
        END IF;
      
      -- Status changed to 'ready_for_collection' (print operator done) - Notify accountant
      ELSIF NEW.status = 'ready_for_collection' AND accountant_id IS NOT NULL THEN
        SELECT COUNT(*) INTO existing_notification_count
        FROM public.notifications
        WHERE order_id = NEW.id 
        AND recipient_id = accountant_id
        AND message LIKE '%order ready for collection%'
        AND created_at > NOW() - INTERVAL '1 minute';
        
        IF existing_notification_count = 0 THEN
          PERFORM public.send_whatsapp_notification(
            accountant_id,
            'Hi ' || accountant_name || ', order ready for collection: ' || order_title || ' for customer: ' || customer_name || '. Please finalize.',
            NEW.id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;