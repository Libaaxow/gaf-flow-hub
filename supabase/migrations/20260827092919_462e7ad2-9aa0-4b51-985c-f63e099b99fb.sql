CREATE TABLE public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_files TO authenticated;
GRANT ALL ON public.lead_files TO service_role;
ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lead files" ON public.lead_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Uploader can add lead files" ON public.lead_files FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Uploader or admin can delete lead files" ON public.lead_files FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read lead files bucket" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'lead-files');
CREATE POLICY "Authenticated can upload lead files bucket" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lead-files');
CREATE POLICY "Owner can delete lead files bucket" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'lead-files' AND owner = auth.uid());