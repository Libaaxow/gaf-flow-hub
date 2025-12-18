
-- Create beginning_balances table to track opening balances
CREATE TABLE public.beginning_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.beginning_balances ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage beginning balances"
ON public.beginning_balances
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can manage beginning balances"
ON public.beginning_balances
FOR ALL
USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Board can view beginning balances"
ON public.beginning_balances
FOR SELECT
USING (has_role(auth.uid(), 'board'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_beginning_balances_updated_at
BEFORE UPDATE ON public.beginning_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
