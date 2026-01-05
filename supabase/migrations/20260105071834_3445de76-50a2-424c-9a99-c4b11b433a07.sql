-- Create commission withdrawal requests table
CREATE TABLE public.commission_withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.commission_withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own withdrawal requests
CREATE POLICY "Users can view their own withdrawal requests"
ON public.commission_withdrawal_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own withdrawal requests
CREATE POLICY "Users can create their own withdrawal requests"
ON public.commission_withdrawal_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins and accountants can view all withdrawal requests
CREATE POLICY "Admins and accountants can view all withdrawal requests"
ON public.commission_withdrawal_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'accountant')
  )
);

-- Admins and accountants can update withdrawal requests
CREATE POLICY "Admins and accountants can update withdrawal requests"
ON public.commission_withdrawal_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'accountant')
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_commission_withdrawal_requests_updated_at
BEFORE UPDATE ON public.commission_withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for withdrawal requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.commission_withdrawal_requests;