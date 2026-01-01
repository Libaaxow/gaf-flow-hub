-- Create trigger to process email notifications when a new email notification is inserted
CREATE OR REPLACE FUNCTION public.trigger_email_notification_processing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger for email notifications
  IF NEW.notification_type = 'email' AND NEW.email_status = 'pending' THEN
    -- Call the process-email-notifications edge function
    PERFORM net.http_post(
      url := 'https://rokxjikofbbgmwgqowwk.supabase.co/functions/v1/process-email-notifications',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJva3hqaWtvZmJiZ213Z3Fvd3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1Mjc4NDYsImV4cCI6MjA3ODEwMzg0Nn0.FJcanoxTR7lTRwN-6Elp_iUvHSAiiCH0Jjab2sfPTUg"}'::jsonb,
      body := '{"trigger": "new_email_notification"}'::jsonb
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for automatic email processing
DROP TRIGGER IF EXISTS process_email_on_insert ON public.notifications;
CREATE TRIGGER process_email_on_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_email_notification_processing();