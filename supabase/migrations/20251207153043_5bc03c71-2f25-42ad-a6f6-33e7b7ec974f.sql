-- Create enum for purchase order status
CREATE TYPE public.purchase_order_status AS ENUM ('draft', 'sent', 'approved', 'received', 'cancelled');

-- Create enum for vendor bill status  
CREATE TYPE public.vendor_bill_status AS ENUM ('unpaid', 'partially_paid', 'paid');

-- Create tax settings table for global VAT configuration
CREATE TABLE public.tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_enabled boolean NOT NULL DEFAULT false,
  vat_percentage numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Insert default tax settings
INSERT INTO public.tax_settings (vat_enabled, vat_percentage) VALUES (false, 0);

-- Create products/inventory table
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  unit text NOT NULL DEFAULT 'piece',
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  preferred_vendor_id uuid REFERENCES public.vendors(id),
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_code)
);

-- Create product vendors junction table (multiple vendors per product)
CREATE TABLE public.product_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  is_preferred boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, vendor_id)
);

-- Create purchase orders table
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  status public.purchase_order_status NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_enabled boolean NOT NULL DEFAULT false,
  vat_percentage numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  delivery_terms text,
  received_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create purchase order items table
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  received_quantity integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create vendor bills table
CREATE TABLE public.vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status public.vendor_bill_status NOT NULL DEFAULT 'unpaid',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create vendor payments table
CREATE TABLE public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  vendor_bill_id uuid REFERENCES public.vendor_bills(id),
  amount numeric(12,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL, -- 'cash', 'bank_transfer', 'evc', 'zaad', 'sahal', 'other'
  reference_number text,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tax_settings
CREATE POLICY "Authenticated users can view tax settings" ON public.tax_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update tax settings" ON public.tax_settings FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for products
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert products" ON public.products FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update products" ON public.products FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view products" ON public.products FOR SELECT USING (has_role(auth.uid(), 'board'));

-- RLS Policies for product_vendors
CREATE POLICY "Authenticated users can view product vendors" ON public.product_vendors FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert product vendors" ON public.product_vendors FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update product vendors" ON public.product_vendors FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can delete product vendors" ON public.product_vendors FOR DELETE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for purchase_orders
CREATE POLICY "Authenticated users can view purchase orders" ON public.purchase_orders FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert purchase orders" ON public.purchase_orders FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update purchase orders" ON public.purchase_orders FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete purchase orders" ON public.purchase_orders FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view purchase orders" ON public.purchase_orders FOR SELECT USING (has_role(auth.uid(), 'board'));

-- RLS Policies for purchase_order_items
CREATE POLICY "Authenticated users can view purchase order items" ON public.purchase_order_items FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert purchase order items" ON public.purchase_order_items FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update purchase order items" ON public.purchase_order_items FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can delete purchase order items" ON public.purchase_order_items FOR DELETE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for vendor_bills
CREATE POLICY "Authenticated users can view vendor bills" ON public.vendor_bills FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert vendor bills" ON public.vendor_bills FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update vendor bills" ON public.vendor_bills FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete vendor bills" ON public.vendor_bills FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view vendor bills" ON public.vendor_bills FOR SELECT USING (has_role(auth.uid(), 'board'));

-- RLS Policies for vendor_payments
CREATE POLICY "Authenticated users can view vendor payments" ON public.vendor_payments FOR SELECT USING (true);
CREATE POLICY "Accountants and admins can insert vendor payments" ON public.vendor_payments FOR INSERT WITH CHECK (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants and admins can update vendor payments" ON public.vendor_payments FOR UPDATE USING (has_role(auth.uid(), 'accountant') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete vendor payments" ON public.vendor_payments FOR DELETE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Board can view vendor payments" ON public.vendor_payments FOR SELECT USING (has_role(auth.uid(), 'board'));

-- Function to generate PO number
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  po_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.purchase_orders
  WHERE po_number ~ '^PO-\d+$';
  
  po_num := 'PO-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN po_num;
END;
$$;

-- Function to generate vendor bill number
CREATE OR REPLACE FUNCTION public.generate_vendor_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  bill_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM 'BILL-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.vendor_bills
  WHERE bill_number ~ '^BILL-\d+$';
  
  bill_num := 'BILL-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN bill_num;
END;
$$;

-- Function to generate vendor payment number
CREATE OR REPLACE FUNCTION public.generate_vendor_payment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  payment_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number FROM 'VPAY-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.vendor_payments
  WHERE payment_number ~ '^VPAY-\d+$';
  
  payment_num := 'VPAY-' || LPAD(next_num::TEXT, 5, '0');
  
  RETURN payment_num;
END;
$$;

-- Function to generate product code
CREATE OR REPLACE FUNCTION public.generate_product_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'PRD-' || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.products p WHERE p.product_code = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Trigger to update product cost when purchase order is received
CREATE OR REPLACE FUNCTION public.update_product_on_po_receive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process when status changes to 'received'
  IF NEW.status = 'received' AND OLD.status != 'received' THEN
    -- Update stock quantities and costs for each item
    UPDATE public.products p
    SET 
      stock_quantity = p.stock_quantity + poi.quantity,
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
$$;

CREATE TRIGGER trigger_update_product_on_po_receive
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_on_po_receive();

-- Trigger to update vendor bill status when payment is made
CREATE OR REPLACE FUNCTION public.update_vendor_bill_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_paid numeric(12,2);
  bill_total numeric(12,2);
BEGIN
  IF NEW.vendor_bill_id IS NOT NULL THEN
    -- Calculate total paid for this bill
    SELECT COALESCE(SUM(amount), 0) INTO total_paid
    FROM public.vendor_payments
    WHERE vendor_bill_id = NEW.vendor_bill_id;
    
    -- Get bill total
    SELECT total_amount INTO bill_total
    FROM public.vendor_bills
    WHERE id = NEW.vendor_bill_id;
    
    -- Update bill status and amount paid
    UPDATE public.vendor_bills
    SET 
      amount_paid = total_paid,
      status = CASE 
        WHEN total_paid >= bill_total THEN 'paid'::vendor_bill_status
        WHEN total_paid > 0 THEN 'partially_paid'::vendor_bill_status
        ELSE 'unpaid'::vendor_bill_status
      END,
      updated_at = now()
    WHERE id = NEW.vendor_bill_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_vendor_bill_on_payment
  AFTER INSERT ON public.vendor_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_vendor_bill_on_payment();

-- Add updated_at trigger for new tables
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_bills_updated_at
  BEFORE UPDATE ON public.vendor_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();