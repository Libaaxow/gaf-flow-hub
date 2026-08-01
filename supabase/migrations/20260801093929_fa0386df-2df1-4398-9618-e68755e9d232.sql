CREATE POLICY "Users manage own work log photos"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'work-log-photos' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'work-log-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Managers view work log photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'work-log-photos' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'accountant') OR
    public.has_role(auth.uid(), 'board')
  )
);