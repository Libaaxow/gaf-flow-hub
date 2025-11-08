-- Create order_history table for tracking all job updates
CREATE TABLE public.order_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- Admins and accountants can view all history
CREATE POLICY "Admins and accountants can view all history"
ON public.order_history
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'accountant'::app_role)
);

-- Authenticated users can view history for their orders
CREATE POLICY "Users can view history for their orders"
ON public.order_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_history.order_id
    AND (
      orders.salesperson_id = auth.uid() OR
      orders.designer_id = auth.uid()
    )
  )
);

-- System can insert history records
CREATE POLICY "System can insert history"
ON public.order_history
FOR INSERT
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_order_history_order_id ON public.order_history(order_id);
CREATE INDEX idx_order_history_created_at ON public.order_history(created_at DESC);

-- Create trigger function to log order changes
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_text TEXT;
  change_details JSONB;
BEGIN
  -- Determine the action based on what changed
  IF TG_OP = 'INSERT' THEN
    action_text := 'Order Created';
    change_details := jsonb_build_object(
      'order_value', NEW.order_value,
      'status', NEW.status,
      'customer_id', NEW.customer_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    change_details := jsonb_build_object();
    
    IF OLD.designer_id IS DISTINCT FROM NEW.designer_id THEN
      action_text := 'Designer Assigned';
      change_details := jsonb_build_object(
        'old_designer_id', OLD.designer_id,
        'new_designer_id', NEW.designer_id
      );
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      action_text := 'Status Changed';
      change_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      );
    ELSIF OLD.order_value IS DISTINCT FROM NEW.order_value THEN
      action_text := 'Order Value Updated';
      change_details := jsonb_build_object(
        'old_value', OLD.order_value,
        'new_value', NEW.order_value
      );
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      action_text := 'Payment Status Changed';
      change_details := jsonb_build_object(
        'old_status', OLD.payment_status,
        'new_status', NEW.payment_status
      );
    ELSE
      action_text := 'Order Updated';
      change_details := jsonb_build_object('updated_fields', 'various');
    END IF;
  END IF;

  -- Insert into history
  INSERT INTO public.order_history (order_id, user_id, action, details)
  VALUES (NEW.id, auth.uid(), action_text, change_details);

  RETURN NEW;
END;
$$;

-- Create trigger for orders table
CREATE TRIGGER orders_change_trigger
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_change();

-- Create trigger function to log file uploads
CREATE OR REPLACE FUNCTION public.log_file_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Create trigger for order_files table
CREATE TRIGGER order_files_upload_trigger
AFTER INSERT ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.log_file_upload();