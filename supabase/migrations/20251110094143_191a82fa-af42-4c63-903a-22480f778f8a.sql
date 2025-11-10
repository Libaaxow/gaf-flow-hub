-- Enable full replica identity for orders table to capture complete row data during updates
ALTER TABLE public.orders REPLICA IDENTITY FULL;