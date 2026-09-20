ALTER TABLE public.contract_product_prices
  ADD COLUMN IF NOT EXISTS width numeric,
  ADD COLUMN IF NOT EXISTS height numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric;

ALTER TABLE public.contract_product_prices
  DROP CONSTRAINT IF EXISTS contract_product_prices_agreement_id_product_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS contract_product_prices_unique_size
  ON public.contract_product_prices (agreement_id, product_id, COALESCE(width, 0), COALESCE(height, 0));