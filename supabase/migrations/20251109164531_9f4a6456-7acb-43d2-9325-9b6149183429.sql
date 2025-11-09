-- Create a function to notify about new notifications via pg_net
CREATE OR REPLACE FUNCTION notify_new_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the process-notifications edge function immediately
  PERFORM net.http_post(
    url := 'https://rokxjikofbbgmwgqowwk.supabase.co/functions/v1/process-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJva3hqaWtvZmJiZ213Z3Fvd3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1Mjc4NDYsImV4cCI6MjA3ODEwMzg0Nn0.FJcanoxTR7lTRwN-6Elp_iUvHSAiiCH0Jjab2sfPTUg"}'::jsonb,
    body := '{"trigger": "new_notification"}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires immediately after notification insert
DROP TRIGGER IF EXISTS trigger_process_notification_immediately ON notifications;
CREATE TRIGGER trigger_process_notification_immediately
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_notification();