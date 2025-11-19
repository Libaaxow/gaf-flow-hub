-- Allow designers to delete files they uploaded
CREATE POLICY "Designers can delete their own files"
ON public.order_files
FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by);