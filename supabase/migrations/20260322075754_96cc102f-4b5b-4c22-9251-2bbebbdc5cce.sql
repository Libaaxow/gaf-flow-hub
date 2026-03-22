
-- Create shareholder transaction type enum
CREATE TYPE public.shareholder_transaction_type AS ENUM (
  'capital_investment',
  'profit_share',
  'debt_taken',
  'debt_repayment',
  'withdrawal',
  'adjustment'
);

-- Create shareholders table
CREATE TABLE public.shareholders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  share_percentage NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shareholder_transactions table (full ledger)
CREATE TABLE public.shareholder_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shareholder_id UUID NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  transaction_type public.shareholder_transaction_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  reference_number TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shareholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shareholder_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for shareholders - admin only management
CREATE POLICY "Admins can manage shareholders" ON public.shareholders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view shareholders" ON public.shareholders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'board'));

-- RLS policies for shareholder_transactions - admin only management
CREATE POLICY "Admins can manage shareholder transactions" ON public.shareholder_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view shareholder transactions" ON public.shareholder_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'board'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shareholders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shareholder_transactions;
