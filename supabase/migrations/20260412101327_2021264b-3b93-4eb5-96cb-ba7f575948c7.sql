
ALTER TABLE public.shareholders
ADD COLUMN asset_value numeric NOT NULL DEFAULT 0,
ADD COLUMN asset_description text NULL;
