-- Update RLS policies for user_wallets to give accountants access
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Admins can insert wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Admins can update wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Admins can delete wallets" ON public.user_wallets;

-- Admins and accountants can view all wallets
CREATE POLICY "Admins and accountants can view all wallets"
ON public.user_wallets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Admins and accountants can insert wallets
CREATE POLICY "Admins and accountants can insert wallets"
ON public.user_wallets
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Admins and accountants can update wallets
CREATE POLICY "Admins and accountants can update wallets"
ON public.user_wallets
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Only admins can delete wallets
CREATE POLICY "Admins can delete wallets"
ON public.user_wallets
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update RLS policies for wallet_transactions to give accountants access
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.wallet_transactions;

-- Admins and accountants can view all transactions
CREATE POLICY "Admins and accountants can view all transactions"
ON public.wallet_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

-- Admins and accountants can insert transactions
CREATE POLICY "Admins and accountants can insert transactions"
ON public.wallet_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));