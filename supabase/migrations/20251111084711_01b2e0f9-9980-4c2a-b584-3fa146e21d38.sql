-- Ensure the trigger is attached to the orders table
DROP TRIGGER IF EXISTS on_order_change ON public.orders;

CREATE TRIGGER on_order_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();