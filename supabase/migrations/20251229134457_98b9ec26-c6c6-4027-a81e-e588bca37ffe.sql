-- Add delete policy for wallet_transactions (only admins can delete)
CREATE POLICY "Admins can delete transactions"
ON public.wallet_transactions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));