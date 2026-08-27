GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_files TO authenticated;
GRANT ALL ON public.request_files TO service_role;

INSERT INTO public.request_files (request_id, uploaded_by, file_name, file_path, file_type)
SELECT '4233c759-d111-4a0d-8eea-0461614964be'::uuid,
       '4c942408-4868-4dba-9e50-207f33b351d0'::uuid,
       'GAF Certificate 2026.jpg',
       '4233c759-d111-4a0d-8eea-0461614964be/1787823618263-GAF_Certificate_2026.jpg',
       'image/jpeg'
WHERE NOT EXISTS (
  SELECT 1 FROM public.request_files
  WHERE file_path = '4233c759-d111-4a0d-8eea-0461614964be/1787823618263-GAF_Certificate_2026.jpg'
);