-- Fix search_path for handle_new_user function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    NEW.email
  );
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Fix search_path for log_file_upload function
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

-- Recreate the trigger
CREATE TRIGGER track_file_uploads
AFTER INSERT ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.log_file_upload();