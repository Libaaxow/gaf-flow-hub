-- Add new columns to orders table for job creation workflow
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS print_type TEXT,
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Create enum for print types if needed (can be expanded)
DO $$ BEGIN
  CREATE TYPE print_type_enum AS ENUM (
    'business_card',
    'flyer',
    'banner',
    'brochure',
    'poster',
    't_shirt',
    'mug',
    'sticker',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add check constraint for quantity
ALTER TABLE public.orders 
ADD CONSTRAINT quantity_positive CHECK (quantity > 0);