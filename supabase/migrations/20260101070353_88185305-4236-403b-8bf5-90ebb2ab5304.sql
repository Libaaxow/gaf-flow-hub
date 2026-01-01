-- Add email notification preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;

-- Add email_status and email_sent_at columns to notifications table
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS email_error text;

-- Add update policy for notifications (for edge function to update email status)
DROP POLICY IF EXISTS "System can update notifications" ON public.notifications;
CREATE POLICY "System can update notifications"
ON public.notifications
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create a function to queue email notifications when order assignments change
CREATE OR REPLACE FUNCTION public.queue_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_email TEXT;
  recipient_name TEXT;
  job_title TEXT;
  customer_name TEXT;
  notification_id UUID;
BEGIN
  -- Get job details
  SELECT o.job_title, c.name INTO job_title, customer_name
  FROM public.orders o
  JOIN public.customers c ON c.id = o.customer_id
  WHERE o.id = NEW.id;

  -- Check if designer was assigned
  IF OLD.designer_id IS DISTINCT FROM NEW.designer_id AND NEW.designer_id IS NOT NULL THEN
    -- Get designer details and check if email notifications enabled
    SELECT p.email, p.full_name INTO recipient_email, recipient_name
    FROM public.profiles p
    WHERE p.id = NEW.designer_id AND p.email_notifications_enabled = true;

    IF recipient_email IS NOT NULL THEN
      -- Insert email notification record
      INSERT INTO public.notifications (
        order_id,
        recipient_id,
        notification_type,
        message,
        status,
        email_status
      ) VALUES (
        NEW.id,
        NEW.designer_id,
        'email',
        'You have been assigned to design job: ' || job_title || ' for customer: ' || customer_name,
        'pending',
        'pending'
      );
    END IF;
  END IF;

  -- Check if print operator was assigned
  IF OLD.print_operator_id IS DISTINCT FROM NEW.print_operator_id AND NEW.print_operator_id IS NOT NULL THEN
    -- Get print operator details and check if email notifications enabled
    SELECT p.email, p.full_name INTO recipient_email, recipient_name
    FROM public.profiles p
    WHERE p.id = NEW.print_operator_id AND p.email_notifications_enabled = true;

    IF recipient_email IS NOT NULL THEN
      -- Insert email notification record
      INSERT INTO public.notifications (
        order_id,
        recipient_id,
        notification_type,
        message,
        status,
        email_status
      ) VALUES (
        NEW.id,
        NEW.print_operator_id,
        'email',
        'You have been assigned to print job: ' || job_title || ' for customer: ' || customer_name,
        'pending',
        'pending'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for email notifications on order assignment
DROP TRIGGER IF EXISTS queue_email_on_assignment ON public.orders;
CREATE TRIGGER queue_email_on_assignment
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_email_notification();