CREATE TABLE public.work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  log_time time NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::time,
  job_name text NOT NULL,
  work_type text,
  quantity numeric,
  price numeric,
  status text NOT NULL DEFAULT 'done',
  notes text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_logs TO authenticated;
GRANT ALL ON public.work_logs TO service_role;

ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage their own work logs"
ON public.work_logs FOR ALL TO authenticated
USING (auth.uid() = operator_id)
WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "Managers can view all work logs"
ON public.work_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'accountant') OR
  public.has_role(auth.uid(), 'board')
);

CREATE TRIGGER update_work_logs_updated_at
BEFORE UPDATE ON public.work_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_work_logs_operator_date ON public.work_logs(operator_id, log_date DESC);