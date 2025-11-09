-- Create function to send WhatsApp notification via edge function
CREATE OR REPLACE FUNCTION public.send_whatsapp_notification(
  recipient_id UUID,
  notification_message TEXT,
  order_id_param UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_whatsapp TEXT;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get recipient's WhatsApp number
  SELECT whatsapp_number INTO recipient_whatsapp
  FROM public.profiles
  WHERE id = recipient_id;

  -- Only send if WhatsApp number exists
  IF recipient_whatsapp IS NOT NULL AND recipient_whatsapp != '' THEN
    -- Insert notification record
    INSERT INTO public.notifications (
      order_id,
      recipient_id,
      notification_type,
      message,
      status
    ) VALUES (
      order_id_param,
      recipient_id,
      'whatsapp',
      notification_message,
      'pending'
    );

    -- Note: The actual WhatsApp sending will be handled by the edge function
    -- triggered by the notification insert
  END IF;
END;
$$;

-- Create trigger function to send notifications on order status changes
CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accountant_id UUID;
  designer_whatsapp TEXT;
  print_operator_id UUID;
  customer_name TEXT;
  order_title TEXT;
BEGIN
  -- Get order details
  SELECT c.name, o.job_title INTO customer_name, order_title
  FROM public.orders o
  JOIN public.customers c ON c.id = o.customer_id
  WHERE o.id = NEW.id;

  -- Find an accountant
  SELECT user_id INTO accountant_id
  FROM public.user_roles
  WHERE role = 'accountant'
  LIMIT 1;

  -- NEW ORDER CREATED (by sales) - Notify accountant
  IF TG_OP = 'INSERT' THEN
    IF accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'New order created: ' || order_title || ' for customer: ' || customer_name || '. Please review and approve.',
        NEW.id
      );
    END IF;

  -- ORDER STATUS CHANGED
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    
    -- Status changed to 'designing' (accountant approved) - Notify designer
    IF NEW.status = 'designing' AND NEW.designer_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        NEW.designer_id,
        'You have been assigned to design order: ' || order_title || ' for customer: ' || customer_name,
        NEW.id
      );
    
    -- Status changed to 'ready_for_print' (designer done) - Notify accountant
    ELSIF NEW.status = 'ready_for_print' AND accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'Design completed for order: ' || order_title || '. Ready for printing approval.',
        NEW.id
      );
    
    -- Status changed to 'printing' (accountant approved for print) - Notify print operator
    ELSIF NEW.status = 'printing' THEN
      SELECT user_id INTO print_operator_id
      FROM public.user_roles
      WHERE role = 'print_operator'
      LIMIT 1;
      
      IF print_operator_id IS NOT NULL THEN
        PERFORM public.send_whatsapp_notification(
          print_operator_id,
          'New print job ready: ' || order_title || ' for customer: ' || customer_name,
          NEW.id
        );
      END IF;
    
    -- Status changed to 'completed' (print operator done) - Notify accountant
    ELSIF NEW.status = 'completed' AND accountant_id IS NOT NULL THEN
      PERFORM public.send_whatsapp_notification(
        accountant_id,
        'Print job completed for order: ' || order_title || '. Ready for final processing.',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_order_notifications ON public.orders;
CREATE TRIGGER trigger_order_notifications
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();

-- Create function to process pending notifications
CREATE OR REPLACE FUNCTION public.process_pending_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_record RECORD;
  recipient_whatsapp TEXT;
BEGIN
  -- Process all pending notifications
  FOR notification_record IN 
    SELECT n.id, n.recipient_id, n.message, n.order_id
    FROM public.notifications n
    WHERE n.status = 'pending'
    LIMIT 10
  LOOP
    -- Get recipient WhatsApp number
    SELECT whatsapp_number INTO recipient_whatsapp
    FROM public.profiles
    WHERE id = notification_record.recipient_id;

    -- Mark as sent (the edge function will be called separately)
    IF recipient_whatsapp IS NOT NULL AND recipient_whatsapp != '' THEN
      UPDATE public.notifications
      SET status = 'sent', sent_at = NOW()
      WHERE id = notification_record.id;
    ELSE
      UPDATE public.notifications
      SET status = 'failed'
      WHERE id = notification_record.id;
    END IF;
  END LOOP;
END;
$$;