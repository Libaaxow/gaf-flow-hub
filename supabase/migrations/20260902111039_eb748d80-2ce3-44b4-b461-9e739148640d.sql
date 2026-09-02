-- Accountants can execute Board-approved corporate resolutions
CREATE POLICY "accountants execute approved requests" ON public.corporate_requests
FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) AND status = 'approved')
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants insert dividends" ON public.dividend_declarations
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants update dividends" ON public.dividend_declarations
FOR UPDATE USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants insert entitlements" ON public.dividend_entitlements
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants update entitlements" ON public.dividend_entitlements
FOR UPDATE USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants insert share tx" ON public.share_transactions
FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "accountants update shareholders" ON public.shareholders
FOR UPDATE USING (has_role(auth.uid(), 'accountant'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));