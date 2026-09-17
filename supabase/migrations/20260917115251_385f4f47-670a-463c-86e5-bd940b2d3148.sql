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
        WHEN p.sale_type = 'service' THEN p.stock_quantity
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