-- Add RLS policy for Board to view invoice items
CREATE POLICY "Board can view invoice items" 
ON public.invoice_items 
FOR SELECT 
USING (has_role(auth.uid(), 'board'::app_role));