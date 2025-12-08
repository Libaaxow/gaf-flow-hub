-- Extend invoice_items to support product-based invoicing with retail units
ALTER TABLE public.invoice_items 
ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN retail_unit text DEFAULT 'piece',
ADD COLUMN cost_per_unit numeric(12,2) DEFAULT 0,
ADD COLUMN line_cost numeric(12,2) DEFAULT 0,
ADD COLUMN line_profit numeric(12,2) DEFAULT 0;

-- Add index for product lookup
CREATE INDEX idx_invoice_items_product_id ON public.invoice_items(product_id);

-- Create function to reduce inventory when invoice item is created
CREATE OR REPLACE FUNCTION public.reduce_inventory_on_invoice_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Only reduce inventory if product_id is specified
  IF NEW.product_id IS NOT NULL THEN
    -- Check if sufficient stock is available
    IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
        (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id), NEW.quantity;
    END IF;
    
    -- Reduce inventory in retail units
    UPDATE public.products 
    SET stock_quantity = stock_quantity - NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to restore inventory when invoice item is deleted
CREATE OR REPLACE FUNCTION public.restore_inventory_on_invoice_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only restore inventory if product_id was specified
  IF OLD.product_id IS NOT NULL THEN
    UPDATE public.products 
    SET stock_quantity = stock_quantity + OLD.quantity,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for inventory reduction on insert
CREATE TRIGGER reduce_inventory_on_invoice_item_insert
AFTER INSERT ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.reduce_inventory_on_invoice_item();

-- Create trigger for inventory restoration on delete
CREATE TRIGGER restore_inventory_on_invoice_item_delete
BEFORE DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.restore_inventory_on_invoice_item_delete();

-- Create function to handle inventory adjustment on invoice item update
CREATE OR REPLACE FUNCTION public.adjust_inventory_on_invoice_item_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If product changed or quantity changed, adjust inventory
  IF OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    -- Restore old product's inventory if there was a previous product
    IF OLD.product_id IS NOT NULL THEN
      UPDATE public.products 
      SET stock_quantity = stock_quantity + OLD.quantity,
          updated_at = now()
      WHERE id = OLD.product_id;
    END IF;
    
    -- Reduce new product's inventory if there's a new product
    IF NEW.product_id IS NOT NULL THEN
      -- Check if sufficient stock is available
      IF (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id) < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
          (SELECT stock_quantity FROM public.products WHERE id = NEW.product_id), NEW.quantity;
      END IF;
      
      UPDATE public.products 
      SET stock_quantity = stock_quantity - NEW.quantity,
          updated_at = now()
      WHERE id = NEW.product_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for inventory adjustment on update
CREATE TRIGGER adjust_inventory_on_invoice_item_update
AFTER UPDATE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.adjust_inventory_on_invoice_item_update();