-- 1. Recipe / Bill of Materials table
CREATE TABLE public.product_recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_required numeric NOT NULL CHECK (quantity_required > 0),
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_recipes_unique_component UNIQUE (product_id, component_product_id),
  CONSTRAINT product_recipes_no_self CHECK (product_id <> component_product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recipes TO authenticated;
GRANT ALL ON public.product_recipes TO service_role;

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view product recipes"
ON public.product_recipes FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins and accountants can manage product recipes"
ON public.product_recipes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE TRIGGER update_product_recipes_updated_at
BEFORE UPDATE ON public.product_recipes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_recipes_product ON public.product_recipes(product_id);
CREATE INDEX idx_product_recipes_component ON public.product_recipes(component_product_id);

-- 2. Central stock movement helper (handles standard, area, service and composite)
CREATE OR REPLACE FUNCTION public.apply_product_stock_change(_product_id uuid, _qty_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_type text;
  r RECORD;
  v_needed numeric;
  v_available numeric;
BEGIN
  IF _product_id IS NULL OR COALESCE(_qty_delta, 0) = 0 THEN
    RETURN;
  END IF;

  SELECT sale_type INTO v_sale_type FROM public.products WHERE id = _product_id;
  IF v_sale_type IS NULL OR v_sale_type = 'service' THEN
    RETURN;
  END IF;

  IF v_sale_type = 'composite' THEN
    FOR r IN
      SELECT pr.component_product_id, pr.quantity_required, p.name, p.retail_unit, p.stock_quantity, p.sale_type
      FROM public.product_recipes pr
      JOIN public.products p ON p.id = pr.component_product_id
      WHERE pr.product_id = _product_id
    LOOP
      IF r.sale_type = 'service' THEN
        CONTINUE;
      END IF;
      v_needed := r.quantity_required * _qty_delta;
      IF v_needed < 0 THEN
        v_available := r.stock_quantity;
        IF v_available < ABS(v_needed) THEN
          RAISE EXCEPTION 'Insufficient raw material "%": available % %, required % %',
            r.name, v_available, COALESCE(r.retail_unit, 'unit'), ABS(v_needed), COALESCE(r.retail_unit, 'unit');
        END IF;
      END IF;
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_needed, updated_at = now()
      WHERE id = r.component_product_id;
    END LOOP;
    RETURN;
  END IF;

  IF _qty_delta < 0 THEN
    SELECT stock_quantity INTO v_available FROM public.products WHERE id = _product_id;
    IF v_available < ABS(_qty_delta) THEN
      RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', v_available, ABS(_qty_delta);
    END IF;
  END IF;

  UPDATE public.products
  SET stock_quantity = stock_quantity + _qty_delta, updated_at = now()
  WHERE id = _product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_product_stock_change(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- 3. Rewire invoice item triggers through the helper
CREATE OR REPLACE FUNCTION public.reduce_inventory_on_invoice_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_product_stock_change(NEW.product_id, -NEW.quantity);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_inventory_on_invoice_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_product_stock_change(OLD.product_id, OLD.quantity);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_on_invoice_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    PERFORM public.apply_product_stock_change(OLD.product_id, OLD.quantity);
    PERFORM public.apply_product_stock_change(NEW.product_id, -NEW.quantity);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Purchase order receiving must not touch composite finished goods stock
CREATE OR REPLACE FUNCTION public.update_product_on_po_receive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'received' AND OLD.status != 'received' THEN
    UPDATE public.products p
    SET
      stock_quantity = CASE
        WHEN p.sale_type IN ('service', 'composite') THEN p.stock_quantity
        WHEN p.sale_type = 'area' AND COALESCE(p.total_roll_area, 0) > 0
          THEN p.stock_quantity + (poi.quantity * p.total_roll_area)::integer
        ELSE p.stock_quantity + (poi.quantity * COALESCE(p.conversion_rate, 1))::integer
      END,
      cost_price = poi.unit_cost,
      cost_per_m2 = CASE
        WHEN p.sale_type = 'area' AND COALESCE(p.total_roll_area, 0) > 0
          THEN poi.unit_cost / p.total_roll_area
        ELSE p.cost_per_m2
      END,
      updated_at = now()
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.product_id = p.id;

    UPDATE public.purchase_order_items
    SET received_quantity = quantity
    WHERE purchase_order_id = NEW.id;

    NEW.received_date := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;
