ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sale_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_sale_type_check CHECK (sale_type IN ('unit','area','service'));

CREATE OR REPLACE FUNCTION public.reduce_inventory_on_invoice_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_sale_type text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT sale_type INTO v_sale_type FROM public.products WHERE id = NEW.product_id;
    IF v_sale_type = 'service' THEN
      RETURN NEW;
    END IF;
    IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %',
        (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id), NEW.quantity;
    END IF;
    UPDATE public.products
    SET stock_quantity = stock_quantity - NEW.quantity, updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_on_invoice_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    IF OLD.product_id IS NOT NULL AND COALESCE((SELECT sale_type FROM public.products WHERE id = OLD.product_id), 'unit') <> 'service' THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + OLD.quantity, updated_at = now()
      WHERE id = OLD.product_id;
    END IF;

    IF NEW.product_id IS NOT NULL AND COALESCE((SELECT sale_type FROM public.products WHERE id = NEW.product_id), 'unit') <> 'service' THEN
      IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %',
          (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id), NEW.quantity;
      END IF;
      UPDATE public.products
      SET stock_quantity = stock_quantity - NEW.quantity, updated_at = now()
      WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_inventory_on_invoice_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.product_id IS NOT NULL AND COALESCE((SELECT sale_type FROM public.products WHERE id = OLD.product_id), 'unit') <> 'service' THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity + OLD.quantity, updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$function$;