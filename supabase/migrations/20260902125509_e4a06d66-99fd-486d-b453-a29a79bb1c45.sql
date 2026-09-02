CREATE TABLE public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  allowances numeric(12,2) NOT NULL DEFAULT 0,
  deductions numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  reference_number text,
  notes text,
  status text NOT NULL DEFAULT 'paid',
  paid_at timestamptz NOT NULL DEFAULT now(),
  processed_by uuid REFERENCES public.profiles(id),
  expense_id uuid REFERENCES public.expenses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payroll_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.payroll_payments(id) ON DELETE CASCADE,
  account text NOT NULL,
  debit numeric(12,2) NOT NULL DEFAULT 0,
  credit numeric(12,2) NOT NULL DEFAULT 0,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
GRANT ALL ON public.payroll_payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_journal_entries TO authenticated;
GRANT ALL ON public.payroll_journal_entries TO service_role;

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can view payroll" ON public.payroll_payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'board') OR public.has_role(auth.uid(), 'auditor')
    OR employee_id = auth.uid()
  );

CREATE POLICY "Finance can record payroll" ON public.payroll_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Finance can update payroll" ON public.payroll_payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Admins can delete payroll" ON public.payroll_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Finance can view payroll journal" ON public.payroll_journal_entries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'board') OR public.has_role(auth.uid(), 'auditor')
  );

CREATE POLICY "Finance can insert payroll journal" ON public.payroll_journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE TRIGGER update_payroll_payments_updated_at
  BEFORE UPDATE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_payroll_employee ON public.payroll_payments(employee_id);
CREATE INDEX idx_payroll_period ON public.payroll_payments(period_year, period_month);