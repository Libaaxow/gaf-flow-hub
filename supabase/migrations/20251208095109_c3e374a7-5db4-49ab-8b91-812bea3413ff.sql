-- Add dual-unit columns to products table
ALTER TABLE public.products 
ADD COLUMN purchase_unit text NOT NULL DEFAULT 'piece',
ADD COLUMN retail_unit text NOT NULL DEFAULT 'piece',
ADD COLUMN conversion_rate numeric(12,4) NOT NULL DEFAULT 1,
ADD COLUMN cost_per_retail_unit numeric(12,2) GENERATED ALWAYS AS (
  CASE WHEN conversion_rate > 0 THEN cost_price / conversion_rate ELSE 0 END
) STORED,
ADD COLUMN profit_per_unit numeric(12,2) GENERATED ALWAYS AS (
  CASE WHEN conversion_rate > 0 THEN selling_price - (cost_price / conversion_rate) ELSE 0 END
) STORED;

-- Rename the old 'unit' column to avoid confusion (this is the retail unit now)
-- We'll keep it for backward compatibility and copy value to retail_unit
UPDATE public.products SET retail_unit = unit, purchase_unit = unit WHERE true;

-- Update the trigger function to convert purchase units to retail units on PO receive
CREATE OR REPLACE FUNCTION public.update_product_on_po_receive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process when status changes to 'received'
  IF NEW.status = 'received' AND OLD.status != 'received' THEN
    -- Update stock quantities (converting purchase units to retail units) and costs for each item
    UPDATE public.products p
    SET 
      -- Multiply by conversion_rate to convert purchase units to retail units
      stock_quantity = p.stock_quantity + (poi.quantity * p.conversion_rate)::integer,
      cost_price = poi.unit_cost,
      updated_at = now()
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
    AND poi.product_id = p.id;
    
    -- Mark items as received
    UPDATE public.purchase_order_items
    SET received_quantity = quantity
    WHERE purchase_order_id = NEW.id;
    
    -- Set received date
    NEW.received_date := CURRENT_DATE;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add comment explaining the dual-unit system
COMMENT ON COLUMN public.products.purchase_unit IS 'Unit used when purchasing from vendors (e.g., Box, Roll, Carton)';
COMMENT ON COLUMN public.products.retail_unit IS 'Unit used when selling to customers (e.g., Piece, Meter, Sheet)';
COMMENT ON COLUMN public.products.conversion_rate IS 'Number of retail units per purchase unit (e.g., 1 Box = 12 Pieces means conversion_rate = 12)';
COMMENT ON COLUMN public.products.cost_per_retail_unit IS 'Auto-calculated: cost_price / conversion_rate';
COMMENT ON COLUMN public.products.profit_per_unit IS 'Auto-calculated: selling_price - cost_per_retail_unit';