import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, CheckCircle, Clock, Plus, TrendingUp, Eye, Calendar as CalendarIcon, Download, Activity, FileText } from 'lucide-react';
import { generateDailyActivityPDF } from '@/utils/generateDailyActivityPDF';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import logo from "@/assets/gaf-media-logo.png";

interface DashboardStats {
  totalSales: number;
  totalCommission: number;
  customersAdded: number;
  draftInvoices: number;
  completedInvoices: number;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
  created_by: string | null;
  total_invoices?: number;
  total_spent?: number;
  last_invoice_date?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  is_draft: boolean;
  notes: string | null;
  created_at: string;
  customers: { name: string } | null;
}

interface Product {
  id: string;
  name: string;
  selling_price: number;
  stock_quantity: number;
  retail_unit: string;
  cost_per_retail_unit: number | null;
  sale_type: string;
  selling_price_per_m2: number | null;
  cost_per_m2: number | null;
}

interface Commission {
  id: string;
  order_id: string;
  commission_amount: number;
  commission_percentage: number;
  created_at: string;
  orders: {
    job_title: string;
    order_value: number;
    payment_status: string;
  } | null;
}

const SalesDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    totalCommission: 0,
    customersAdded: 0,
    draftInvoices: 0,
    completedInvoices: 0,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [phoneCheckOpen, setPhoneCheckOpen] = useState(false);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<any>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [showInvoiceFields, setShowInvoiceFields] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date>(new Date());
  const [invoiceItems, setInvoiceItems] = useState<Array<{ 
    product_id: string | null;
    description: string; 
    quantity: number; 
    unit_price: number;
    retail_unit: string;
    cost_per_unit: number;
    sale_type: string;
    height_m: number | null;
    width_m: number | null;
    area_m2: number | null;
  }>>([
    { product_id: null, description: '', quantity: 1, unit_price: 0, retail_unit: 'piece', cost_per_unit: 0, sale_type: 'unit', height_m: null, width_m: null, area_m2: null }
  ]);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  
  // Separate state for my customers (for display in My Customers tab)
  const myCustomers = customers.filter(c => c.created_by === user?.id);

  useEffect(() => {
    fetchUserRole();
    fetchDashboardData();
    fetchProducts();
    
    // Set up realtime subscription for invoices
    const channel = supabase
      .channel('sales-invoices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `draft_by_sales=eq.${user?.id}`,
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchUserRole = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      setUserRole(data?.role || null);
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, selling_price, stock_quantity, retail_unit, cost_per_retail_unit, sale_type, selling_price_per_m2, cost_per_m2')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();

      // Fetch all customers (for invoice creation dropdown)
      const { data: allCustomersData, error: allCustomersError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (allCustomersError) throw allCustomersError;

      // Fetch customers created by this salesperson (for stats)
      const myCustomersData = allCustomersData?.filter(c => c.created_by === user?.id) || [];

      // Fetch invoices created by this salesperson
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (name)
        `)
        .eq('draft_by_sales', user?.id)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (invoicesError) throw invoicesError;

      // Fetch commissions
      const { data: commissionsData, error: commissionsError } = await supabase
        .from('commissions')
        .select(`
          *,
          orders (job_title, order_value, payment_status)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (commissionsError) throw commissionsError;

      // Calculate stats
      const totalSales = invoicesData?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      const totalCommission = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const draftInvoices = invoicesData?.filter(i => i.is_draft || i.status === 'draft').length || 0;
      const completedInvoices = invoicesData?.filter(i => i.status === 'paid').length || 0;

      // Calculate customer statistics
      const customersWithStats = myCustomersData.map(customer => {
        const customerInvoices = invoicesData?.filter(i => i.customer_id === customer.id) || [];
        const totalInvoices = customerInvoices.length;
        const totalSpent = customerInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
        const lastInvoice = customerInvoices.length > 0 ? customerInvoices[0].created_at : null;
        
        return {
          ...customer,
          total_invoices: totalInvoices,
          total_spent: totalSpent,
          last_invoice_date: lastInvoice,
        };
      });

      setStats({
        totalSales,
        totalCommission,
        customersAdded: myCustomersData.length || 0,
        draftInvoices,
        completedInvoices,
      });

      // Use all customers for dropdowns, but show stats for only my customers
      setCustomers(allCustomersData || []);
      setInvoices(invoicesData || []);
      setCommissions(commissionsData || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const customerData = {
      name: formData.get('name') as string,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      company_name: (formData.get('company_name') as string) || null,
      created_by: user?.id,
    };

    try {
      const { error: customerError } = await supabase
        .from('customers')
        .insert([customerData]);

      if (customerError) throw customerError;

      toast({
        title: 'Success',
        description: 'Customer added successfully',
      });

      form.reset();
      setPhoneNumber('');
      setShowInvoiceFields(false);
      setIsCustomerDialogOpen(false);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handlePhoneCheck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCheckingPhone(true);
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (error) throw error;

      setExistingCustomer(data);
      setPhoneCheckOpen(false);
      setInvoiceFormOpen(true);

      if (data) {
        toast({
          title: 'Customer Found',
          description: `Proceeding with existing customer: ${data.name}`,
        });
      } else {
        toast({
          title: 'New Customer',
          description: 'Please provide customer details',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCheckingPhone(false);
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const isArea = product.sale_type === 'area';
      const newItems = [...invoiceItems];
      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        description: product.name,
        unit_price: isArea ? Number(product.selling_price_per_m2 || 0) : Number(product.selling_price),
        retail_unit: isArea ? 'm²' : (product.retail_unit || 'piece'),
        cost_per_unit: isArea ? Number(product.cost_per_m2 || 0) : Number(product.cost_per_retail_unit || 0),
        sale_type: product.sale_type || 'unit',
        height_m: isArea ? 1 : null,
        width_m: isArea ? 1 : null,
        area_m2: isArea ? 1 : null,
        quantity: isArea ? 1 : newItems[index].quantity,
      };
      setInvoiceItems(newItems);
    }
  };

  const handleCreateDraftInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      setCreatingInvoice(true);
      let customerId = existingCustomer?.id;

      // Create new customer if doesn't exist
      if (!existingCustomer) {
        const customerData = {
          name: formData.get('customer_name') as string,
          phone: phoneNumber,
          email: (formData.get('customer_email') as string) || null,
          company_name: (formData.get('company_name') as string) || null,
          created_by: user?.id,
        };

        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert([customerData])
          .select()
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      // Calculate totals - handle both area-based and unit-based items
      const subtotal = invoiceItems.reduce((sum, item) => {
        if (item.sale_type === 'area') {
          const area = (item.width_m || 0) * (item.height_m || 0);
          return sum + (area * item.unit_price);
        }
        return sum + (item.quantity * item.unit_price);
      }, 0);

      // First create an order with pending_accounting_review status
      // This ensures the draft invoice appears in accountant's workflow
      // Note: Invoice number left blank for accountant to assign manually
      const orderData = {
        customer_id: customerId,
        job_title: formData.get('notes') as string || 'Draft Invoice',
        description: invoiceItems.map(item => item.description).filter(Boolean).join(', ') || null,
        order_value: subtotal,
        amount_paid: 0,
        payment_status: 'unpaid' as const,
        status: 'pending_accounting_review' as const,
        salesperson_id: user?.id,
      };

      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create draft invoice linked to the order
      // Invoice number is PENDING - accountant will assign the actual number manually
      const invoiceData = {
        customer_id: customerId,
        order_id: newOrder.id,
        invoice_number: 'PENDING', // Placeholder - accountant assigns real number
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: formData.get('due_date') as string || null,
        subtotal: subtotal,
        tax_amount: 0,
        total_amount: subtotal,
        amount_paid: 0,
        status: 'draft',
        is_draft: true,
        draft_by_sales: user?.id,
        notes: formData.get('notes') as string || null,
      };

      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([invoiceData])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items with area-based fields for roll products
      // Don't set product_id for draft invoices to avoid inventory reduction
      const itemsToInsert = invoiceItems.map(item => {
        const isAreaBased = item.sale_type === 'area';
        const area = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : null;
        const amount = isAreaBased 
          ? (area || 0) * item.unit_price 
          : item.quantity * item.unit_price;
        
        return {
          invoice_id: newInvoice.id,
          description: item.description,
          quantity: isAreaBased ? 1 : item.quantity, // For area-based, quantity is 1 (the item)
          unit_price: item.unit_price,
          amount: amount,
          retail_unit: item.retail_unit,
          sale_type: item.sale_type,
          height_m: isAreaBased ? item.height_m : null,
          width_m: isAreaBased ? item.width_m : null,
          area_m2: area,
          rate_per_m2: isAreaBased ? item.unit_price : null,
          cost_per_unit: item.cost_per_unit || 0,
          line_cost: isAreaBased 
            ? (area || 0) * (item.cost_per_unit || 0) 
            : item.quantity * (item.cost_per_unit || 0),
          line_profit: isAreaBased
            ? (area || 0) * (item.unit_price - (item.cost_per_unit || 0))
            : item.quantity * (item.unit_price - (item.cost_per_unit || 0)),
          // Don't set product_id for draft invoices to avoid inventory reduction
          // Accountant will link products when finalizing
        };
      });

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: 'Draft invoice sent to accountant for review',
      });

      // Reset form and close dialog
      e.currentTarget.reset();
      setPhoneNumber('');
      setExistingCustomer(null);
      setInvoiceItems([{ product_id: null, description: '', quantity: 1, unit_price: 0, retail_unit: 'piece', cost_per_unit: 0, sale_type: 'unit', height_m: 0, width_m: 0, area_m2: 0 }]);
      setInvoiceFormOpen(false);
      await fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCreatingInvoice(false);
    }
  };

  const getStatusColor = (status: string, isDraft: boolean) => {
    if (isDraft) return 'bg-warning';
    const colors: Record<string, string> = {
      draft: 'bg-warning',
      sent: 'bg-info',
      paid: 'bg-success',
      overdue: 'bg-destructive',
    };
    return colors[status] || 'bg-secondary';
  };

  const handleDownloadActivityReport = async () => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();

      const activities = invoices.map(inv => ({
        time: format(new Date(inv.created_at), 'HH:mm'),
        action: inv.is_draft ? 'Draft Invoice Created' : 'Invoice Created',
        details: `${inv.invoice_number} - ${inv.customers?.name || 'N/A'}`,
        status: inv.status
      }));

      generateDailyActivityPDF({
        userRole: 'Sales',
        userName: profileData?.full_name || 'Sales Person',
        date: dateFilter,
        activities,
        stats: [
          { label: 'Total Sales', value: `$${stats.totalSales.toLocaleString()}` },
          { label: 'Total Commission', value: `$${stats.totalCommission.toLocaleString()}` },
          { label: 'Draft Invoices', value: stats.draftInvoices },
          { label: 'Paid Invoices', value: stats.completedInvoices },
        ]
      });

      toast({
        title: 'Success',
        description: 'Activity report downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getPaymentColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'bg-destructive',
      partial: 'bg-warning',
      paid: 'bg-success',
    };
    return colors[status] || 'bg-secondary';
  };

  // Prepare chart data
  const monthlyData = invoices.reduce((acc, invoice) => {
    const month = new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short' });
    const existingMonth = acc.find(item => item.month === month);
    
    if (existingMonth) {
      existingMonth.sales += Number(invoice.total_amount || 0);
    } else {
      acc.push({ month, sales: Number(invoice.total_amount || 0) });
    }
    
    return acc;
  }, [] as { month: string; sales: number }[]);

  const statusData = [
    { name: 'Draft', value: stats.draftInvoices, color: '#fbbf24' },
    { name: 'Paid', value: stats.completedInvoices, color: '#10b981' },
  ];

  const topCustomers = [...myCustomers]
    .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    .slice(0, 5);

  const statCards = [
    {
      title: 'Total Sales Value',
      value: `$${stats.totalSales.toFixed(2)}`,
      icon: DollarSign,
      description: 'All invoices',
      color: 'text-success',
    },
    {
      title: 'Total Commission',
      value: `$${stats.totalCommission.toFixed(2)}`,
      icon: TrendingUp,
      description: 'Your earnings',
      color: 'text-primary',
    },
    {
      title: 'Customers Added',
      value: stats.customersAdded,
      icon: Users,
      description: 'Total customers',
      color: 'text-info',
    },
    {
      title: 'Draft Invoices',
      value: stats.draftInvoices,
      icon: Clock,
      description: 'Pending accountant review',
      color: 'text-warning',
    },
    {
      title: 'Paid Invoices',
      value: stats.completedInvoices,
      icon: CheckCircle,
      description: 'Completed',
      color: 'text-success',
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 w-full max-w-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {user?.email?.charAt(0).toUpperCase() || 'S'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Sales Dashboard</h1>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFilter ? format(dateFilter, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFilter}
                  onSelect={(date) => {
                    if (date) {
                      setDateFilter(date);
                      fetchDashboardData();
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button onClick={handleDownloadActivityReport} className="gap-2">
              <Download className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Customers */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Customer</TableHead>
                  <TableHead className="min-w-[150px]">Company</TableHead>
                  <TableHead className="min-w-[100px]">Total Invoices</TableHead>
                  <TableHead className="text-right min-w-[120px]">Total Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.company_name || '-'}</TableCell>
                    <TableCell>{customer.total_invoices || 0}</TableCell>
                    <TableCell className="text-right font-bold">
                      ${(customer.total_spent || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {topCustomers.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No customers yet</p>
            )}
          </CardContent>
        </Card>

        {/* Tabs for Invoices, Customers, and Commissions */}
        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto">
            <TabsTrigger value="invoices" className="text-xs sm:text-sm">My Invoices</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs sm:text-sm">My Customers</TabsTrigger>
            <TabsTrigger value="commissions" className="text-xs sm:text-sm">Commission</TabsTrigger>
          </TabsList>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl sm:text-2xl font-bold">My Invoices</h2>
              
              {/* Phone Check Dialog */}
              <Dialog open={phoneCheckOpen} onOpenChange={(open) => {
                setPhoneCheckOpen(open);
                if (!open) {
                  setPhoneNumber('');
                  setExistingCustomer(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enter Customer Phone Number</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handlePhoneCheck} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone_check">Phone Number *</Label>
                      <Input 
                        id="phone_check" 
                        type="tel" 
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="Enter phone number"
                        required 
                      />
                      <p className="text-sm text-muted-foreground">
                        We'll check if this customer already exists
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={checkingPhone}>
                      {checkingPhone ? 'Checking...' : 'Continue'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Invoice Form Dialog */}
              <Dialog open={invoiceFormOpen} onOpenChange={(open) => {
                setInvoiceFormOpen(open);
                if (!open) {
                  setPhoneNumber('');
                  setExistingCustomer(null);
                  setInvoiceItems([{ product_id: null, description: '', quantity: 1, unit_price: 0, retail_unit: 'piece', cost_per_unit: 0, sale_type: 'unit', height_m: 0, width_m: 0, area_m2: 0 }]);
                }
              }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background">
                  <form onSubmit={handleCreateDraftInvoice} className="space-y-6 p-2">
                    {/* Header with Logo and Company Info */}
                    <div className="mb-6">
                      <img src={logo} alt="GAF Media" className="h-16 mb-4" />
                      <div className="flex items-center gap-2 text-warning">
                        <FileText className="h-5 w-5" />
                        <span className="font-semibold">Draft Invoice - Pending Accountant Approval</span>
                      </div>
                    </div>

                    {/* Customer Information */}
                    <div className="border-b border-border pb-6">
                      <h3 className="font-semibold text-lg mb-4">Customer Information</h3>
                      
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="font-semibold">Phone Number</Label>
                          <Input value={phoneNumber} disabled className="bg-muted" />
                        </div>

                        {existingCustomer ? (
                          <div className="col-span-2 space-y-4 rounded-lg border border-border p-4 bg-muted/30">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm font-semibold mb-1">Customer Name</p>
                                <p className="text-base">{existingCustomer.name}</p>
                              </div>
                              {existingCustomer.company_name && (
                                <div>
                                  <p className="text-sm font-semibold mb-1">Company</p>
                                  <p className="text-base">{existingCustomer.company_name}</p>
                                </div>
                              )}
                              {existingCustomer.email && (
                                <div className="col-span-2">
                                  <p className="text-sm font-semibold mb-1">Email</p>
                                  <p className="text-base">{existingCustomer.email}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="customer_name" className="font-semibold">Customer Name *</Label>
                              <Input id="customer_name" name="customer_name" required />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="customer_email" className="font-semibold">Email</Label>
                              <Input id="customer_email" name="customer_email" type="email" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="company_name" className="font-semibold">Company Name</Label>
                              <Input id="company_name" name="company_name" />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Invoice Details */}
                    <div className="border-b border-border pb-6">
                      <h3 className="font-semibold text-lg mb-4">Invoice Details</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="due_date" className="font-semibold">Due Date</Label>
                          <Input 
                            id="due_date" 
                            name="due_date" 
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Invoice Items */}
                    <div className="border-b border-border pb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">Invoice Items</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setInvoiceItems([...invoiceItems, { product_id: null, description: '', quantity: 1, unit_price: 0, retail_unit: 'piece', cost_per_unit: 0, sale_type: 'unit', height_m: 0, width_m: 0, area_m2: 0 }])}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Item
                        </Button>
                      </div>

                      <div className="space-y-4">
                      <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[25%]">Product</TableHead>
                              <TableHead className="w-[20%]">Description</TableHead>
                              <TableHead className="w-[10%]">Unit</TableHead>
                              <TableHead className="w-[15%]">Qty / Size</TableHead>
                              <TableHead className="w-[12%]">Rate</TableHead>
                              <TableHead className="w-[12%]">Total</TableHead>
                              <TableHead className="w-[6%]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoiceItems.map((item, index) => {
                              const isAreaBased = item.sale_type === 'area';
                              const calculatedArea = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : 0;
                              const lineTotal = isAreaBased 
                                ? calculatedArea * item.unit_price 
                                : item.quantity * item.unit_price;
                              
                              return (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Select
                                      value={item.product_id || ''}
                                      onValueChange={(value) => handleProductSelect(index, value)}
                                    >
                                      <SelectTrigger className="bg-background">
                                        <SelectValue placeholder="Select product" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-background z-50">
                                        {products.map((product) => (
                                          <SelectItem key={product.id} value={product.id}>
                                            {product.name} {product.sale_type === 'area' ? `($${product.selling_price_per_m2}/m²)` : `($${product.selling_price})`}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={item.description}
                                      onChange={(e) => {
                                        const newItems = [...invoiceItems];
                                        newItems[index].description = e.target.value;
                                        setInvoiceItems(newItems);
                                      }}
                                      placeholder="Description"
                                      required
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">{item.retail_unit}</span>
                                  </TableCell>
                                  <TableCell>
                                    {isAreaBased ? (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={item.width_m || ''}
                                            onChange={(e) => {
                                              const newItems = [...invoiceItems];
                                              const width = parseFloat(e.target.value) || 0;
                                              newItems[index].width_m = width;
                                              newItems[index].area_m2 = width * (newItems[index].height_m || 0);
                                              setInvoiceItems(newItems);
                                            }}
                                            placeholder="W"
                                            className="w-16 text-xs"
                                            required
                                          />
                                          <span className="text-xs text-muted-foreground">×</span>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={item.height_m || ''}
                                            onChange={(e) => {
                                              const newItems = [...invoiceItems];
                                              const height = parseFloat(e.target.value) || 0;
                                              newItems[index].height_m = height;
                                              newItems[index].area_m2 = (newItems[index].width_m || 0) * height;
                                              setInvoiceItems(newItems);
                                            }}
                                            placeholder="H"
                                            className="w-16 text-xs"
                                            required
                                          />
                                          <span className="text-xs text-muted-foreground">m</span>
                                        </div>
                                        <span className="text-xs text-primary font-medium">
                                          = {calculatedArea.toFixed(2)} m²
                                        </span>
                                      </div>
                                    ) : (
                                      <Input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const newItems = [...invoiceItems];
                                          newItems[index].quantity = parseInt(e.target.value) || 1;
                                          setInvoiceItems(newItems);
                                        }}
                                        required
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-col">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.unit_price}
                                        onChange={(e) => {
                                          const newItems = [...invoiceItems];
                                          newItems[index].unit_price = parseFloat(e.target.value) || 0;
                                          setInvoiceItems(newItems);
                                        }}
                                        required
                                      />
                                      {isAreaBased && (
                                        <span className="text-xs text-muted-foreground">/m²</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold">
                                    ${lineTotal.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    {invoiceItems.length > 1 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const newItems = invoiceItems.filter((_, i) => i !== index);
                                          setInvoiceItems(newItems);
                                        }}
                                      >
                                        ×
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>

                        <div className="flex justify-end pt-4 border-t">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground mb-1">
                              Total Items: {invoiceItems.reduce((sum, item) => {
                                if (item.sale_type === 'area') {
                                  return sum + 1;
                                }
                                return sum + item.quantity;
                              }, 0)}
                            </p>
                            <p className="text-xl font-bold">
                              Total: ${invoiceItems.reduce((sum, item) => {
                                if (item.sale_type === 'area') {
                                  const area = (item.width_m || 0) * (item.height_m || 0);
                                  return sum + (area * item.unit_price);
                                }
                                return sum + (item.quantity * item.unit_price);
                              }, 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="notes" className="font-semibold">Notes (Optional)</Label>
                        <Textarea 
                          id="notes" 
                          name="notes" 
                          rows={2}
                          placeholder="Any special instructions or notes for the accountant..."
                        />
                      </div>
                    </div>

                    <div className="bg-warning/10 border border-warning rounded-lg p-4">
                      <p className="text-sm text-warning-foreground">
                        <strong>Note:</strong> This will create a draft invoice without an invoice number. 
                        The accountant will review and assign a proper invoice number.
                      </p>
                    </div>

                    <Button type="submit" className="w-full" disabled={creatingInvoice}>
                      {creatingInvoice ? 'Creating Draft Invoice...' : 'Send to Accountant for Review'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Invoice #</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="text-right min-w-[100px]">Amount</TableHead>
                      <TableHead className="text-right min-w-[100px]">Paid</TableHead>
                      <TableHead className="text-center min-w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">
                          {invoice.invoice_number === 'PENDING' ? (
                            <Badge variant="outline" className="text-muted-foreground">Awaiting Number</Badge>
                          ) : invoice.invoice_number}
                        </TableCell>
                        <TableCell>{invoice.customers?.name || '-'}</TableCell>
                        <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(invoice.status, invoice.is_draft)}>
                            {invoice.is_draft ? 'Draft - Pending Review' : invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          ${Number(invoice.total_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          ${Number(invoice.amount_paid || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              toast({
                                title: 'Invoice Details',
                                description: `Invoice ${invoice.invoice_number} - ${invoice.is_draft ? 'Waiting for accountant approval' : invoice.status}`,
                              });
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {invoices.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No invoices yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl sm:text-2xl font-bold">My Customers</h2>
              <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Customer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddCustomer} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input id="name" name="name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input 
                        id="phone" 
                        name="phone" 
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input id="company_name" name="company_name" />
                    </div>
                    <Button type="submit" className="w-full">Add Customer</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Customer Name</TableHead>
                      <TableHead className="min-w-[150px]">Contact</TableHead>
                      <TableHead className="text-center min-w-[120px]">Total Invoices</TableHead>
                      <TableHead className="text-right min-w-[120px]">Total Spent</TableHead>
                      <TableHead className="min-w-[120px]">Last Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.company_name && (
                              <p className="text-xs text-muted-foreground">{customer.company_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {customer.email && <p>{customer.email}</p>}
                            {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{customer.total_invoices || 0}</TableCell>
                        <TableCell className="text-right font-bold">
                          ${(customer.total_spent || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {customer.last_invoice_date 
                            ? new Date(customer.last_invoice_date).toLocaleDateString()
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {myCustomers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No customers yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold">Commission Tracker</h2>
            
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    ${stats.totalCommission.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Paid Commission</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-success">
                    ${commissions
                      .filter(c => c.orders?.payment_status === 'paid')
                      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0)
                      .toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Pending Commission</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">
                    ${commissions
                      .filter(c => c.orders?.payment_status !== 'paid')
                      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0)
                      .toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Job Name</TableHead>
                      <TableHead className="text-right min-w-[120px]">Order Value</TableHead>
                      <TableHead className="text-center min-w-[120px]">Commission %</TableHead>
                      <TableHead className="text-right min-w-[140px]">Commission Amount</TableHead>
                      <TableHead className="min-w-[120px]">Payment Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell className="font-medium">
                          {commission.orders?.job_title || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          ${Number(commission.orders?.order_value || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {Number(commission.commission_percentage || 0).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          ${Number(commission.commission_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getPaymentColor(commission.orders?.payment_status || 'unpaid')}>
                            {commission.orders?.payment_status || 'unpaid'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {commissions.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No commissions yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default SalesDashboard;
