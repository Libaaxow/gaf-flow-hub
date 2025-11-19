-- Allow designers to delete files they uploaded
-- This enables designers to manage their own file uploads

CREATE POLICY "Designers can delete their own uploaded files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'order-files' 
  AND (storage.foldername(name))[1] IN (
    SELECT id::text 
    FROM orders 
    WHERE designer_id = auth.uid()
  )
);