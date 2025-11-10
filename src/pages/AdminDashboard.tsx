import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Package, Users, DollarSign, AlertCircle, Calendar as CalendarIcon, Download, Activity, Plus, FileText } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { generateDailyActivityPDF } from '@/utils/generateDailyActivityPDF';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { z } from 'zod';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Order {
  id: string;
  job_title: string;
  status: string;
  order_value: number;
  payment_status: string;
  created_at: string;
  delivery_date: string | null;
  customer_id: string;
  designer_id: string | null;
  salesperson_id: string | null;
  customers: { name: string } | null;
  designer?: { full_name: string } | null;
  salesperson?: { full_name: string } | null;
}

interface Designer {
  id: string;
  full_name: string;
}

interface Salesperson {
  id: string;
  full_name: string;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer: { name: string };
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
}

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(9, 'Phone must be at least 9 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('').transform(() => null)),
  company_name: z.string().optional().or(z.literal('').transform(() => null)),
});

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Filter states
  const [filterDesigner, setFilterDesigner] = useState<string>('all');
  const [filterSalesperson, setFilterSalesperson] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<Date>(new Date());

  // Customer form states
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);

  // Invoice form states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTax, setInvoiceTax] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  
  // Invoice items state
  interface InvoiceItem {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0, amount: 0 }
  ]);

  // Stats
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    deliveredOrders: 0
  });

  useEffect(() => {
    fetchAllData();

    // Set up realtime subscription for orders
    const channel = supabase
      .channel('admin-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchAllData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, filterDesigner, filterSalesperson, filterCustomer, filterStatus, searchQuery, dateFilter]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch orders filtered by date
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();

      // Fetch order history for today's activity
      const { data: historyData } = await supabase
        .from('order_history')
        .select('*, orders(job_title, status, customers(name))')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      
      setOrderHistory(historyData || []);
      
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch designers and salespeople separately
      const ordersWithProfiles = await Promise.all(
        (ordersData || []).map(async (order) => {
          let designer = null;
          let salesperson = null;

          if (order.designer_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.designer_id)
              .single();
            designer = data;
          }

          if (order.salesperson_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.salesperson_id)
              .single();
            salesperson = data;
          }

          return { ...order, designer, salesperson };
        })
      );

      setOrders(ordersWithProfiles);

      // Calculate stats
      const totalRevenue = ordersWithProfiles.reduce((sum, o) => sum + (o.order_value || 0), 0);
      const pendingOrders = ordersWithProfiles.filter(o => o.status === 'pending').length;
      const deliveredOrders = ordersWithProfiles.filter(o => o.status === 'delivered').length;

      setStats({
        totalOrders: ordersWithProfiles.length,
        totalRevenue,
        pendingOrders,
        deliveredOrders
      });

      // Fetch designers
      const { data: designersData } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name)')
        .eq('role', 'designer');

      const designersList = designersData
        ?.map((d: any) => d.profiles)
        .filter((p: any) => p !== null) || [];
      setDesigners(designersList);

      // Fetch salespeople
      const { data: salespeopleData } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name)')
        .eq('role', 'sales');

      const salespeopleList = salespeopleData
        ?.map((s: any) => s.profiles)
        .filter((p: any) => p !== null) || [];
      setSalespeople(salespeopleList);

      // Fetch customers
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, name, email, phone, company_name, created_at')
        .order('name');

      setCustomers(customersData || []);

      // Fetch invoices
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(name, email, phone),
          invoice_items(
            id,
            description,
            quantity,
            unit_price,
            amount
          )
        `)
        .order('created_at', { ascending: false });
      
      setInvoices(invoicesData || []);

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...orders];

    if (filterDesigner !== 'all') {
      filtered = filtered.filter(o => o.designer_id === filterDesigner);
    }

    if (filterSalesperson !== 'all') {
      filtered = filtered.filter(o => o.salesperson_id === filterSalesperson);
    }

    if (filterCustomer !== 'all') {
      filtered = filtered.filter(o => o.customer_id === filterCustomer);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(o => o.status === filterStatus);
    }

    if (searchQuery) {
      filtered = filtered.filter(o =>
        o.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customers?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500',
      designing: 'bg-blue-500',
      designed: 'bg-purple-500',
      approved: 'bg-green-500',
      printing: 'bg-orange-500',
      printed: 'bg-teal-500',
      delivered: 'bg-green-700',
      on_hold: 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'bg-red-500',
      partial: 'bg-yellow-500',
      paid: 'bg-green-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const handleCreateCustomer = async () => {
    try {
      const validatedData = customerSchema.parse({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || null,
        company_name: customerCompany || null,
      });

      const { error } = await supabase
        .from('customers')
        .insert([{ 
          name: validatedData.name,
          phone: validatedData.phone,
          email: validatedData.email,
          company_name: validatedData.company_name,
          created_by: user?.id 
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer created successfully',
      });

      setIsCustomerDialogOpen(false);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create customer',
        variant: 'destructive',
      });
    }
  };

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { description: '', quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    }
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...invoiceItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate amount
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    }
    
    setInvoiceItems(newItems);
  };

  const calculateInvoiceSubtotal = () => {
    return invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleCreateInvoice = async () => {
    if (!invoiceNumber || !invoiceCustomer || invoiceItems.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields and add at least one item',
        variant: 'destructive',
      });
      return;
    }

    // Validate all items have descriptions
    const hasEmptyDescriptions = invoiceItems.some(item => !item.description.trim());
    if (hasEmptyDescriptions) {
      toast({
        title: 'Validation Error',
        description: 'All items must have a description',
        variant: 'destructive',
      });
      return;
    }

    try {
      const subtotal = calculateInvoiceSubtotal();
      const tax = parseFloat(invoiceTax) || 0;
      const total = subtotal + tax;

      // Insert invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert([
          {
            invoice_number: invoiceNumber,
            customer_id: invoiceCustomer,
            order_id: invoiceOrder || null,
            invoice_date: new Date().toISOString().split('T')[0],
            due_date: invoiceDueDate || null,
            subtotal,
            tax_amount: tax,
            total_amount: total,
            amount_paid: 0,
            status: 'draft',
            notes: invoiceNotes || null,
            created_by: user?.id,
          },
        ])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert invoice items
      const itemsToInsert = invoiceItems.map(item => ({
        invoice_id: invoiceData.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: `Invoice ${invoiceNumber} created successfully`,
      });

      // Reset form
      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0 }]);
      
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      let updateData: any = { status: newStatus };

      if (newStatus === 'paid') {
        updateData.amount_paid = invoice.total_amount;
      } else if (newStatus === 'unpaid') {
        updateData.amount_paid = 0;
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Invoice marked as ${newStatus}`,
      });

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDownloadActivityReport = async () => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();

      const activities = orderHistory.map(h => ({
        time: format(new Date(h.created_at), 'HH:mm'),
        action: h.action,
        details: `${h.orders?.job_title || 'N/A'} - ${h.orders?.customers?.name || 'N/A'}`,
        status: h.details?.new_status || h.details?.old_status || 'N/A'
      }));

      generateDailyActivityPDF({
        userRole: 'Admin',
        userName: profileData?.full_name || 'Admin',
        date: dateFilter,
        activities,
        stats: [
          { label: 'Total Orders', value: stats.totalOrders },
          { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}` },
          { label: 'Pending Orders', value: stats.pendingOrders },
          { label: 'Delivered Orders', value: stats.deliveredOrders },
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
      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 sm:space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Complete oversight and control of all jobs</p>
        </div>
        <Button onClick={handleDownloadActivityReport} className="gap-2">
          <Download className="h-4 w-4" />
          Download Today's Report
        </Button>
      </div>

      {/* Today's Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Today's Activity ({orderHistory.length} actions)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orderHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No activity recorded today</p>
            ) : (
              orderHistory
                .filter((history) => history.action === 'Order Created')
                .slice(0, 10)
                .map((history) => {
                  const orderStatus = history.orders?.status || 'pending';
                  const statusText = orderStatus === 'completed' 
                    ? 'Completed' 
                    : orderStatus === 'printing' 
                    ? 'In Print' 
                    : orderStatus === 'designing'
                    ? 'In Design'
                    : orderStatus === 'ready_for_print'
                    ? 'Ready for Print'
                    : 'Pending';
                  
                  return (
                    <div key={history.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="text-xs text-muted-foreground min-w-[50px]">
                        {format(new Date(history.created_at), 'HH:mm')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {history.orders?.job_title || 'N/A'} - {history.orders?.customers?.name || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Status: {statusText}
                        </p>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.deliveredOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  <span className="truncate">{dateFilter ? format(dateFilter, "PPP") : "Pick a date"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFilter}
                  onSelect={(date) => {
                    if (date) {
                      setDateFilter(date);
                      fetchAllData();
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />

            <Select value={filterDesigner} onValueChange={setFilterDesigner}>
              <SelectTrigger>
                <SelectValue placeholder="All Designers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Designers</SelectItem>
                {designers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSalesperson} onValueChange={setFilterSalesperson}>
              <SelectTrigger>
                <SelectValue placeholder="All Salespeople" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salespeople</SelectItem>
                {salespeople.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="designing">In Design</SelectItem>
                <SelectItem value="designed">Ready for Print</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="printing">Printing</SelectItem>
                <SelectItem value="printed">Printed</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>All Orders ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No orders found</p>
            ) : (
              filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-semibold truncate">{order.job_title}</h3>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                      <Badge className={getPaymentStatusColor(order.payment_status)}>
                        {order.payment_status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="truncate">Customer: {order.customers?.name || 'N/A'}</p>
                      <p className="truncate">Designer: {order.designer?.full_name || 'Unassigned'}</p>
                      <p className="truncate">Salesperson: {order.salesperson?.full_name || 'N/A'}</p>
                      <p>Created: {format(new Date(order.created_at), 'MMM dd, yyyy')}</p>
                      {order.delivery_date && (
                        <p>Delivery: {format(new Date(order.delivery_date), 'MMM dd, yyyy')}</p>
                      )}
                    </div>
                  </div>
                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end gap-2">
                    <p className="text-xl sm:text-2xl font-bold">${order.order_value?.toLocaleString() || '0'}</p>
                    <Button variant="outline" size="sm" className="whitespace-nowrap">
                      View Details
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="customers" className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Customer Management</h2>
          <p className="text-muted-foreground">Create and manage customers</p>
        </div>
        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Customer</DialogTitle>
              <DialogDescription>Add a new customer to the system</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Company name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateCustomer}>Create Customer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{customer.company_name || '-'}</TableCell>
                  <TableCell>{format(new Date(customer.created_at), 'MMM d, yyyy')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="invoices" className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Invoice Management</h2>
          <p className="text-muted-foreground">Create and manage invoices</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
              <DialogDescription>Create a new invoice for a customer</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="invoice-number">Invoice Number *</Label>
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-00001"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice-customer">Customer *</Label>
                <Select value={invoiceCustomer} onValueChange={setInvoiceCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice-order">Related Order (Optional)</Label>
                <Select value={invoiceOrder} onValueChange={setInvoiceOrder}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select order (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.job_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due-date">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                />
              </div>
              {/* Invoice Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Invoice Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                
                {invoiceItems.map((item, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label>Description *</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="grid gap-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Unit Price *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Amount</Label>
                          <Input
                            type="number"
                            value={item.amount.toFixed(2)}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                      </div>
                      {invoiceItems.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeInvoiceItem(index)}
                        >
                          Remove Item
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}

                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="font-semibold">Subtotal:</span>
                  <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tax">Tax Amount</Label>
                <Input
                  id="tax"
                  type="number"
                  value={invoiceTax}
                  onChange={(e) => setInvoiceTax(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                <span className="font-semibold text-lg">Total:</span>
                <span className="text-2xl font-bold">
                  ${(calculateInvoiceSubtotal() + (parseFloat(invoiceTax) || 0)).toFixed(2)}
                </span>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice-notes">Notes</Label>
                <Input
                  id="invoice-notes"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Additional notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateInvoice}>Create Invoice</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell>{invoice.customer?.name || 'N/A'}</TableCell>
                  <TableCell>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}</TableCell>
                  <TableCell>${invoice.total_amount.toLocaleString()}</TableCell>
                  <TableCell>${invoice.amount_paid.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={invoice.status === 'paid' ? 'default' : invoice.status === 'unpaid' ? 'destructive' : 'secondary'}>
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setInvoiceDialogOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      {invoice.status !== 'paid' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUpdateInvoiceStatus(invoice.id, 'paid')}
                        >
                          Mark Paid
                        </Button>
                      )}
                      {invoice.status === 'paid' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUpdateInvoiceStatus(invoice.id, 'unpaid')}
                        >
                          Mark Unpaid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TabsContent>

    </Tabs>

    {selectedInvoice && (
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        order={selectedInvoice}
      />
    )}
    </Layout>
  );
}
