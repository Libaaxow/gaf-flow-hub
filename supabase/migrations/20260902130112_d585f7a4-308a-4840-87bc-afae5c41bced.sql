CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  job_title text,
  department text,
  phone text,
  email text,
  monthly_salary numeric NOT NULL DEFAULT 0,
  hire_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view employees"
ON public.employees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and accountants can insert employees"
ON public.employees FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Admins and accountants can update employees"
ON public.employees FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Admins can delete employees"
ON public.employees FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- payroll can reference either an employee record or a system profile
ALTER TABLE public.payroll_payments DROP CONSTRAINT IF EXISTS payroll_payments_employee_id_fkey;

-- backfill employees from profiles that already have payroll history
INSERT INTO public.employees (id, full_name, email, profile_id)
SELECT p.id, p.full_name, p.email, p.id
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.payroll_payments pp WHERE pp.employee_id = p.id)
ON CONFLICT (id) DO NOTHING;