-- Create wallet transaction types enum
CREATE TYPE public.wallet_transaction_type AS ENUM (
  'daily_credit',
  'penalty',
  'advance',
  'advance_deduction',
  'bonus',
  'adjustment'
);

-- Create user wallets table
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_balance numeric(12,2) NOT NULL DEFAULT 0,
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0,
  advance_balance numeric(12,2) NOT NULL DEFAULT 0,
  last_daily_credit_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create wallet transactions table
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount numeric(12,2) NOT NULL,
  transaction_type wallet_transaction_type NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_wallets
CREATE POLICY "Users can view their own wallet"
ON public.user_wallets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets"
ON public.user_wallets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert wallets"
ON public.user_wallets FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update wallets"
ON public.user_wallets FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete wallets"
ON public.user_wallets FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for wallet_transactions
CREATE POLICY "Users can view their own transactions"
ON public.wallet_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
ON public.wallet_transactions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert transactions"
ON public.wallet_transactions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create function to process daily salary credits
CREATE OR REPLACE FUNCTION public.process_daily_salary_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet_record RECORD;
  daily_amount numeric(12,2);
  advance_deduction numeric(12,2);
  net_credit numeric(12,2);
BEGIN
  FOR wallet_record IN 
    SELECT * FROM public.user_wallets 
    WHERE monthly_salary > 0 
    AND (last_daily_credit_date IS NULL OR last_daily_credit_date < CURRENT_DATE)
  LOOP
    -- Calculate daily salary (monthly / 30)
    daily_amount := ROUND(wallet_record.monthly_salary / 30, 2);
    
    -- Check if there's advance to deduct
    IF wallet_record.advance_balance > 0 THEN
      -- Deduct up to daily amount from advance
      advance_deduction := LEAST(daily_amount, wallet_record.advance_balance);
      net_credit := daily_amount - advance_deduction;
      
      -- Update advance balance
      UPDATE public.user_wallets
      SET advance_balance = advance_balance - advance_deduction,
          current_balance = current_balance + net_credit,
          last_daily_credit_date = CURRENT_DATE,
          updated_at = now()
      WHERE id = wallet_record.id;
      
      -- Record advance deduction transaction
      IF advance_deduction > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, amount, transaction_type, description)
        VALUES (wallet_record.user_id, -advance_deduction, 'advance_deduction', 'Daily advance deduction');
      END IF;
      
      -- Record net credit if any
      IF net_credit > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, amount, transaction_type, description)
        VALUES (wallet_record.user_id, net_credit, 'daily_credit', 'Daily salary credit (after advance deduction)');
      END IF;
    ELSE
      -- No advance, full daily credit
      UPDATE public.user_wallets
      SET current_balance = current_balance + daily_amount,
          last_daily_credit_date = CURRENT_DATE,
          updated_at = now()
      WHERE id = wallet_record.id;
      
      INSERT INTO public.wallet_transactions (user_id, amount, transaction_type, description)
      VALUES (wallet_record.user_id, daily_amount, 'daily_credit', 'Daily salary credit');
    END IF;
  END LOOP;
END;
$$;

-- Create updated_at trigger
CREATE TRIGGER update_user_wallets_updated_at
BEFORE UPDATE ON public.user_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();