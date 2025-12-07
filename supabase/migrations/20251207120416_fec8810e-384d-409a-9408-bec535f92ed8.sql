-- Add new values to the quotation_status enum
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'cancelled';