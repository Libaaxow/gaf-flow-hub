-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'designer', 'print_operator', 'accountant');

-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('pending', 'designing', 'designed', 'approved', 'printing', 'printed', 'delivered');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'partial', 'paid');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  commission_percentage DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  job_title TEXT NOT NULL,
  description TEXT,
  order_value DECIMAL(10,2) DEFAULT 0,
  salesperson_id UUID REFERENCES auth.users(id),
  designer_id UUID REFERENCES auth.users(id),
  status order_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'unpaid',
  amount_paid DECIMAL(10,2) DEFAULT 0,
  delivery_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create order_files table for file attachments
CREATE TABLE public.order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  is_final_design BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- Create commissions table
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  salesperson_id UUID REFERENCES auth.users(id) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Create order_comments table for messaging
CREATE TABLE public.order_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for customers
CREATE POLICY "Authenticated users can view customers" ON public.customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales and admins can create customers" ON public.customers
  FOR INSERT TO authenticated 
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales and admins can update customers" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete customers" ON public.customers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for orders
CREATE POLICY "Authenticated users can view orders" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sales and admins can create orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authorized users can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'sales') OR
    public.has_role(auth.uid(), 'designer') OR
    public.has_role(auth.uid(), 'print_operator') OR
    public.has_role(auth.uid(), 'accountant')
  );

CREATE POLICY "Admins can delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for order_files
CREATE POLICY "Authenticated users can view order files" ON public.order_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upload files" ON public.order_files
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Admins can delete files" ON public.order_files
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for commissions
CREATE POLICY "Users can view their own commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (auth.uid() = salesperson_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "System can create commissions" ON public.commissions
  FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for order_comments
CREATE POLICY "Users can view order comments" ON public.order_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create comments" ON public.order_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to calculate commission when order is created/updated
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_percentage DECIMAL(5,2);
  v_commission_amount DECIMAL(10,2);
BEGIN
  -- Only calculate if order has value and salesperson
  IF NEW.order_value > 0 AND NEW.salesperson_id IS NOT NULL THEN
    -- Get salesperson commission percentage
    SELECT commission_percentage INTO v_commission_percentage
    FROM public.profiles
    WHERE id = NEW.salesperson_id;
    
    v_commission_percentage := COALESCE(v_commission_percentage, 0);
    v_commission_amount := NEW.order_value * (v_commission_percentage / 100);
    
    -- Insert or update commission record
    INSERT INTO public.commissions (order_id, salesperson_id, commission_amount, commission_percentage)
    VALUES (NEW.id, NEW.salesperson_id, v_commission_amount, v_commission_percentage)
    ON CONFLICT (order_id) DO UPDATE
    SET commission_amount = v_commission_amount,
        commission_percentage = v_commission_percentage;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add unique constraint to commissions for order_id
ALTER TABLE public.commissions ADD CONSTRAINT commissions_order_id_key UNIQUE (order_id);

CREATE TRIGGER calculate_order_commission
  AFTER INSERT OR UPDATE OF order_value, salesperson_id
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.calculate_commission();

-- Create storage bucket for order files
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-files', 'order-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for order files
CREATE POLICY "Authenticated users can view order files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-files');

CREATE POLICY "Authenticated users can upload order files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-files' AND auth.uid()::text IS NOT NULL);

CREATE POLICY "Users can update their own uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'order-files' AND auth.uid()::text IS NOT NULL);

CREATE POLICY "Admins can delete order files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'order-files');