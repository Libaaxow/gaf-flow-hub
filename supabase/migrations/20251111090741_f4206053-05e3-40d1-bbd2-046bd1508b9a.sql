-- Remove duplicate trigger that's causing double notifications
DROP TRIGGER IF EXISTS trigger_order_notifications ON public.orders;