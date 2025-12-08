-- Add area-based selling support to products table
ALTER TABLE public.products 
ADD COLUMN sale_type text NOT NULL DEFAULT 'unit' CHECK (sale_type IN ('unit', 'area')),
ADD COLUMN roll_width numeric(10,2) NULL,
ADD COLUMN roll_length numeric(10,2) NULL,
ADD COLUMN total_roll_area numeric(12,4) NULL,
ADD COLUMN cost_per_m2 numeric(12,4) NULL,
ADD COLUMN selling_price_per_m2 numeric(12,4) NULL;

-- Add dimension fields to invoice_items for area-based products
ALTER TABLE public.invoice_items
ADD COLUMN sale_type text NOT NULL DEFAULT 'unit',
ADD COLUMN height_m numeric(10,3) NULL,
ADD COLUMN width_m numeric(10,3) NULL,
ADD COLUMN area_m2 numeric(12,4) NULL,
ADD COLUMN rate_per_m2 numeric(12,4) NULL;

-- Comment for clarity
COMMENT ON COLUMN public.products.sale_type IS 'unit = standard unit-based, area = H×W area-based (m²)';
COMMENT ON COLUMN public.products.roll_width IS 'Roll width in meters for area-based products';
COMMENT ON COLUMN public.products.roll_length IS 'Roll length in meters for area-based products';
COMMENT ON COLUMN public.products.total_roll_area IS 'Total area per roll (width × length) in m²';
COMMENT ON COLUMN public.products.cost_per_m2 IS 'Cost per square meter = cost_price / total_roll_area';
COMMENT ON COLUMN public.products.selling_price_per_m2 IS 'Selling price per square meter';

COMMENT ON COLUMN public.invoice_items.height_m IS 'Height in meters for area-based items';
COMMENT ON COLUMN public.invoice_items.width_m IS 'Width in meters for area-based items';
COMMENT ON COLUMN public.invoice_items.area_m2 IS 'Calculated area (height × width) in m²';
COMMENT ON COLUMN public.invoice_items.rate_per_m2 IS 'Price rate per square meter';