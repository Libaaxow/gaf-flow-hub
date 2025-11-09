-- Fix search_path for remaining functions

-- Fix update_updated_at_column
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Recreate all triggers that used update_updated_at_column
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Fix log_file_upload
DROP FUNCTION IF EXISTS public.log_file_upload() CASCADE;
CREATE OR REPLACE FUNCTION public.log_file_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.order_history (order_id, user_id, action, details)
  VALUES (
    NEW.order_id,
    NEW.uploaded_by,
    CASE 
      WHEN NEW.is_final_design THEN 'Final Design File Uploaded'
      ELSE 'File Uploaded'
    END,
    jsonb_build_object(
      'file_name', NEW.file_name,
      'file_type', NEW.file_type,
      'is_final_design', NEW.is_final_design
    )
  );
  
  RETURN NEW;
END;
$function$;

-- Recreate trigger
CREATE TRIGGER track_file_uploads
AFTER INSERT ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.log_file_upload();