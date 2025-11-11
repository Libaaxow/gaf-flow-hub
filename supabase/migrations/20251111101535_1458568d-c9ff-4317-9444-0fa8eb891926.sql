
-- Create trigger to log order changes and send notifications
CREATE TRIGGER trigger_notify_on_order_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();

-- Create trigger to process new notifications immediately
CREATE TRIGGER trigger_notify_new_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_notification();

-- Add foreign key constraint from user_roles to profiles
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
  ADD CONSTRAINT user_roles_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
