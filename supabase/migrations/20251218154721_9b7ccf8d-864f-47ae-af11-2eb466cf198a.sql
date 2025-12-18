-- Create table for sales request files
CREATE TABLE public.request_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.sales_order_requests(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.profiles(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.request_files ENABLE ROW LEVEL SECURITY;

-- Designers can upload files to their assigned requests
CREATE POLICY "Designers can upload files to assigned requests"
ON public.request_files
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_order_requests
    WHERE id = request_id AND designer_id = auth.uid()
  )
);

-- Designers can view files for their assigned requests
CREATE POLICY "Designers can view files for assigned requests"
ON public.request_files
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales_order_requests
    WHERE id = request_id AND designer_id = auth.uid()
  )
);

-- Accountants and admins can view all request files
CREATE POLICY "Accountants and admins can view all request files"
ON public.request_files
FOR SELECT
USING (
  has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Accountants and admins can delete request files
CREATE POLICY "Accountants and admins can delete request files"
ON public.request_files
FOR DELETE
USING (
  has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Print operators can view files for their assigned requests
CREATE POLICY "Print operators can view files for assigned requests"
ON public.request_files
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales_order_requests
    WHERE id = request_id AND print_operator_id = auth.uid()
  )
);

-- Create storage bucket for request design files
INSERT INTO storage.buckets (id, name, public) VALUES ('request-files', 'request-files', false);

-- Storage policies for request-files bucket
CREATE POLICY "Designers can upload to request-files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'request-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view request-files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'request-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete request-files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'request-files' AND has_role(auth.uid(), 'admin'::app_role));