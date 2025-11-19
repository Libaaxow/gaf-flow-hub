-- Ensure authenticated users (including designers) can download order files
-- This policy allows all authenticated users to download files from the order-files bucket

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can download order files" ON storage.objects;

-- Create a comprehensive policy for downloading order files
CREATE POLICY "Authenticated users can download order files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'order-files');

-- Ensure the bucket exists and is properly configured
UPDATE storage.buckets
SET public = false
WHERE id = 'order-files';