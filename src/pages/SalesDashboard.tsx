import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, Package, CheckCircle, Clock, Plus, TrendingUp, Edit, Eye, Calendar as CalendarIcon, Download, Activity } from 'lucide-react';
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

interface DashboardStats {
  totalSales: number;
  totalCommission: number;
  customersAdded: number;
  activeJobs: number;
  completedJobs: number;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
  created_by: string | null;
  total_orders?: number;
  total_spent?: number;
  last_order_date?: string | null;
}

interface Order {
  id: string;
  job_title: string;
  description: string | null;
  print_type: string | null;
  quantity: number | null;
  notes: string | null;
  order_value: number;
  status: string;
  payment_status: string;
  delivery_date: string | null;
  created_at: string;
  customer_id: string;
  designer_id: string | null;
  designer_name?: string | null;
  customers: { name: string } | null;
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
    activeJobs: 0,
    completedJobs: 0,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [phoneCheckOpen, setPhoneCheckOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<any>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [showOrderFields, setShowOrderFields] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [designers, setDesigners] = useState<any[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date>(new Date());
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  
  // Separate state for my customers (for display in My Customers tab)
  const myCustomers = customers.filter(c => c.created_by === user?.id);

  useEffect(() => {
    fetchUserRole();
    fetchDashboardData();
    fetchDesigners();
    
    // Set up realtime subscription for orders
    const channel = supabase
      .channel('sales-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `salesperson_id=eq.${user?.id}`,
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

  const fetchDesigners = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'designer');
      
      if (data && data.length > 0) {
        const designerIds = data.map(d => d.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', designerIds);
        
        setDesigners(profiles || []);
      }
    } catch (error) {
      console.error('Error fetching designers:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();

      // Fetch order history for today's activity
      const { data: historyData } = await supabase
        .from('order_history')
        .select('*, orders(job_title, customers(name))')
        .eq('user_id', user?.id)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      
      setOrderHistory(historyData || []);

      // Fetch all customers (for order creation dropdown)
      const { data: allCustomersData, error: allCustomersError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (allCustomersError) throw allCustomersError;

      // Fetch customers created by this salesperson (for stats)
      const myCustomersData = allCustomersData?.filter(c => c.created_by === user?.id) || [];
      const customersData = myCustomersData;

      // Fetch orders for this salesperson
      
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name)
        `)
        .eq('salesperson_id', user?.id)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch designer data separately for each order
      const ordersWithDesigners = await Promise.all(
        (ordersData || []).map(async (order) => {
          if (order.designer_id) {
            const { data: designer } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.designer_id)
              .single();
            return { ...order, designer_name: designer?.full_name || null };
          }
          return { ...order, designer_name: 'Pending Accountant Assignment' };
        })
      );

      // Fetch commissions
      const { data: commissionsData, error: commissionsError } = await supabase
        .from('commissions')
        .select(`
          *,
          orders (job_title, order_value, payment_status)
        `)
        .eq('salesperson_id', user?.id)
        .order('created_at', { ascending: false });

      if (commissionsError) throw commissionsError;

      // Calculate stats
      const totalSales = ordersWithDesigners?.reduce((sum, order) => sum + Number(order.order_value || 0), 0) || 0;
      const totalCommission = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const activeJobs = ordersWithDesigners?.filter(o => 
        o.status === 'pending_accounting_review' || o.status === 'designing' || o.status === 'awaiting_accounting_approval' || o.status === 'ready_for_print' || o.status === 'printing'
      ).length || 0;
      const completedJobs = ordersWithDesigners?.filter(o => o.status === 'delivered').length || 0;

      // Calculate customer statistics
      const customersWithStats = customersData?.map(customer => {
        const customerOrders = ordersWithDesigners?.filter(o => o.customer_id === customer.id) || [];
        const totalOrders = customerOrders.length;
        const totalSpent = customerOrders.reduce((sum, o) => sum + Number(o.order_value || 0), 0);
        const lastOrder = customerOrders.length > 0 ? customerOrders[0].created_at : null;
        
        return {
          ...customer,
          total_orders: totalOrders,
          total_spent: totalSpent,
          last_order_date: lastOrder,
        };
      }) || [];

      setStats({
        totalSales,
        totalCommission,
        customersAdded: customersData?.length || 0,
        activeJobs,
        completedJobs,
      });

      // Use all customers for dropdowns, but show stats for only my customers
      setCustomers(allCustomersData || []);
      setOrders(ordersWithDesigners || []);
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
      // Insert customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single();

      if (customerError) throw customerError;

      // If phone is 9+ digits and order fields are filled, create order too
      if (showOrderFields && newCustomer) {
        const jobTitle = formData.get('job_title') as string;
        const orderValue = formData.get('order_value') as string;
        
        if (jobTitle && orderValue) {
          const orderData = {
            customer_id: newCustomer.id,
            job_title: jobTitle,
            description: (formData.get('description') as string) || null,
            order_value: parseFloat(orderValue),
            salesperson_id: user?.id,
            delivery_date: (formData.get('delivery_date') as string) || null,
          };

          const { error: orderError } = await supabase
            .from('orders')
            .insert([orderData]);

          if (orderError) throw orderError;

          toast({
            title: 'Success',
            description: 'Customer and order created successfully',
          });
        } else {
          toast({
            title: 'Success',
            description: 'Customer added successfully',
          });
        }
      } else {
        toast({
          title: 'Success',
          description: 'Customer added successfully',
        });
      }

      // Reset form before closing dialog
      form.reset();
      setPhoneNumber('');
      setShowOrderFields(false);
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
      setOrderFormOpen(true);

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

  const handleAddOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      setUploadingFiles(true);
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

      // Create order
      const orderData = {
        customer_id: customerId,
        job_title: formData.get('job_title') as string,
        description: formData.get('description') as string,
        print_type: formData.get('print_type') as string,
        quantity: parseInt(formData.get('quantity') as string) || 1,
        notes: formData.get('notes') as string || null,
        order_value: parseFloat(formData.get('order_value') as string),
        salesperson_id: user?.id,
        delivery_date: formData.get('delivery_date') as string || null,
        status: 'pending_accounting_review' as const,
      };

      // Insert order
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single();

      if (orderError) throw orderError;

      // Handle file uploads if any
      const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput?.files && fileInput.files.length > 0) {
        const files = Array.from(fileInput.files);
        
        for (const file of files) {
          const fileName = `${newOrder.id}/${Date.now()}_${file.name}`;
          
          // Upload file to storage without any compression or transformation
          // Preserves original size, resolution, and color mode (CMYK, etc.)
          const { error: uploadError } = await supabase.storage
            .from('order-files')
            .upload(fileName, file, {
              contentType: file.type || 'application/octet-stream',
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) throw uploadError;

          // Record file in database
          const { error: fileRecordError } = await supabase
            .from('order_files')
            .insert({
              order_id: newOrder.id,
              file_name: file.name,
              file_path: fileName,
              file_type: file.type,
              uploaded_by: user?.id,
            });

          if (fileRecordError) throw fileRecordError;
        }
      }

      toast({
        title: 'Success',
        description: 'Order created successfully',
      });

      // Reset form and close dialog
      e.currentTarget.reset();
      setPhoneNumber('');
      setExistingCustomer(null);
      setOrderFormOpen(false);
      await fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleEditOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingOrder) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const orderData = {
      job_title: formData.get('job_title') as string,
      description: formData.get('description') as string,
      order_value: parseFloat(formData.get('order_value') as string),
      designer_id: (formData.get('designer_id') as string) || null,
      delivery_date: formData.get('delivery_date') as string || null,
    };

    try {
      const { error } = await supabase
        .from('orders')
        .update(orderData)
        .eq('id', editingOrder.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order updated successfully',
      });

      // Reset form and close dialog in correct order
      form.reset();
      setEditingOrder(null);
      setIsEditDialogOpen(false);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending_accounting_review: 'bg-warning',
      designing: 'bg-info',
      awaiting_accounting_approval: 'bg-info',
      ready_for_print: 'bg-success',
      printing: 'bg-primary',
      printed: 'bg-success',
      delivered: 'bg-success',
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

      const activities = orderHistory.map(h => ({
        time: format(new Date(h.created_at), 'HH:mm'),
        action: h.action,
        details: `${h.orders?.job_title || 'N/A'} - ${h.orders?.customers?.name || 'N/A'}`,
        status: h.details?.new_status || h.details?.old_status || 'N/A'
      }));

      generateDailyActivityPDF({
        userRole: 'Sales',
        userName: profileData?.full_name || 'Sales Person',
        date: dateFilter,
        activities,
        stats: [
          { label: 'Total Sales', value: `$${stats.totalSales.toLocaleString()}` },
          { label: 'Total Commission', value: `$${stats.totalCommission.toLocaleString()}` },
          { label: 'Active Jobs', value: stats.activeJobs },
          { label: 'Completed Jobs', value: stats.completedJobs },
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
  const monthlyData = orders.reduce((acc, order) => {
    const month = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short' });
    const existingMonth = acc.find(item => item.month === month);
    
    if (existingMonth) {
      existingMonth.sales += Number(order.order_value || 0);
    } else {
      acc.push({ month, sales: Number(order.order_value || 0) });
    }
    
    return acc;
  }, [] as { month: string; sales: number }[]);

  const statusData = [
    { name: 'Active', value: stats.activeJobs, color: '#fbbf24' },
    { name: 'Completed', value: stats.completedJobs, color: '#10b981' },
  ];

  const topCustomers = [...myCustomers]
    .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    .slice(0, 5);

  const statCards = [
    {
      title: 'Total Sales Value',
      value: `$${stats.totalSales.toFixed(2)}`,
      icon: DollarSign,
      description: 'All confirmed jobs',
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
      title: 'Active Jobs',
      value: stats.activeJobs,
      icon: Clock,
      description: 'In progress',
      color: 'text-warning',
    },
    {
      title: 'Completed Jobs',
      value: stats.completedJobs,
      icon: CheckCircle,
      description: 'Delivered orders',
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
                orderHistory.slice(0, 10).map((history) => (
                  <div key={history.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="text-xs text-muted-foreground min-w-[50px]">
                      {format(new Date(history.created_at), 'HH:mm')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{history.action}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {history.orders?.job_title || 'N/A'} - {history.orders?.customers?.name || 'N/A'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

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
              <CardTitle>Job Status Distribution</CardTitle>
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
                  <TableHead className="min-w-[100px]">Total Orders</TableHead>
                  <TableHead className="text-right min-w-[120px]">Total Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.company_name || '-'}</TableCell>
                    <TableCell>{customer.total_orders || 0}</TableCell>
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

        {/* Tabs for Customers, Orders, and Commissions */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto">
            <TabsTrigger value="orders" className="text-xs sm:text-sm">My Orders</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs sm:text-sm">My Customers</TabsTrigger>
            <TabsTrigger value="commissions" className="text-xs sm:text-sm">Commission</TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl sm:text-2xl font-bold">My Orders / Jobs</h2>
              
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
                    New Job Request
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

              {/* Order Form Dialog */}
              <Dialog open={orderFormOpen} onOpenChange={(open) => {
                setOrderFormOpen(open);
                if (!open) {
                  setPhoneNumber('');
                  setExistingCustomer(null);
                }
              }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Job</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddOrder} className="space-y-4">
                    {/* Customer Information */}
                    <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
                      <h3 className="font-semibold">Customer Information</h3>
                      
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input value={phoneNumber} disabled />
                      </div>

                      {existingCustomer ? (
                        <div className="space-y-2 rounded-lg border p-3 bg-background">
                          <div>
                            <p className="text-sm text-muted-foreground">Name</p>
                            <p className="font-medium">{existingCustomer.name}</p>
                          </div>
                          {existingCustomer.company_name && (
                            <div>
                              <p className="text-sm text-muted-foreground">Company</p>
                              <p className="font-medium">{existingCustomer.company_name}</p>
                            </div>
                          )}
                          {existingCustomer.email && (
                            <div>
                              <p className="text-sm text-muted-foreground">Email</p>
                              <p className="font-medium">{existingCustomer.email}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="customer_name">Customer Name *</Label>
                            <Input id="customer_name" name="customer_name" required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="customer_email">Email</Label>
                            <Input id="customer_email" name="customer_email" type="email" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company_name">Company Name</Label>
                            <Input id="company_name" name="company_name" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Job Details */}
                    <div className="space-y-4">
                      <h3 className="font-semibold">Job Details</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="job_title">Job Title *</Label>
                          <Input 
                            id="job_title" 
                            name="job_title" 
                            placeholder="e.g., Business Cards - John Doe"
                            required 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="print_type">Print Type *</Label>
                          <Select name="print_type" required>
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="Select print type" />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              <SelectItem value="business_card">Business Card</SelectItem>
                              <SelectItem value="flyer">Flyer</SelectItem>
                              <SelectItem value="banner">Banner</SelectItem>
                              <SelectItem value="brochure">Brochure</SelectItem>
                              <SelectItem value="poster">Poster</SelectItem>
                              <SelectItem value="t_shirt">T-Shirt</SelectItem>
                              <SelectItem value="mug">Mug</SelectItem>
                              <SelectItem value="sticker">Sticker</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description *</Label>
                        <Textarea 
                          id="description" 
                          name="description" 
                          rows={3}
                          placeholder="Detailed description of the job requirements..."
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="quantity">Quantity *</Label>
                          <Input 
                            id="quantity" 
                            name="quantity" 
                            type="number"
                            min="1"
                            defaultValue="1"
                            required 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="order_value">Order Value ($) *</Label>
                          <Input 
                            id="order_value" 
                            name="order_value" 
                            type="number" 
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            required 
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="delivery_date">Expected Delivery Date *</Label>
                        <Input 
                          id="delivery_date" 
                          name="delivery_date" 
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          required 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reference_files">Upload Reference Files</Label>
                        <Input 
                          id="reference_files" 
                          name="reference_files" 
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,.zip,.doc,.docx"
                        />
                        <p className="text-xs text-muted-foreground">
                          Upload PDF, images, or ZIP files (max 20MB per file)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea 
                          id="notes" 
                          name="notes" 
                          rows={2}
                          placeholder="Any special instructions or notes..."
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={uploadingFiles}>
                      {uploadingFiles ? 'Creating Job & Uploading Files...' : 'Create Job & Send to Accountant'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Edit Order Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
              setIsEditDialogOpen(open);
              if (!open) setEditingOrder(null);
            }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Order</DialogTitle>
                </DialogHeader>
                {editingOrder && (
                  <form onSubmit={handleEditOrder} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_job_title">Job Title *</Label>
                      <Input 
                        id="edit_job_title" 
                        name="job_title" 
                        defaultValue={editingOrder.job_title}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_description">Description / Notes</Label>
                      <Textarea 
                        id="edit_description" 
                        name="description" 
                        defaultValue={editingOrder.description || ''}
                        rows={3} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_order_value">Order Value *</Label>
                      <Input 
                        id="edit_order_value" 
                        name="order_value" 
                        type="number" 
                        step="0.01"
                        defaultValue={editingOrder.order_value}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_delivery_date">Delivery Date</Label>
                      <Input 
                        id="edit_delivery_date" 
                        name="delivery_date" 
                        type="date"
                        defaultValue={editingOrder.delivery_date || ''}
                      />
                    </div>
                    <Button type="submit" className="w-full">Update Order</Button>
                  </form>
                )}
              </DialogContent>
            </Dialog>

            <Card>
              <CardContent className="p-0 overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Order ID</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[150px]">Job Title</TableHead>
                      <TableHead className="min-w-[150px]">Designer</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Payment</TableHead>
                      <TableHead className="text-right min-w-[100px]">Value</TableHead>
                      <TableHead className="text-center min-w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">
                          {order.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>{order.customers?.name || '-'}</TableCell>
                        <TableCell className="font-medium">{order.job_title}</TableCell>
                        <TableCell>
                          {order.designer_name ? (
                            <Badge variant="outline" className="bg-primary/10">
                              {order.designer_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPaymentColor(order.payment_status)}>
                            {order.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          ${Number(order.order_value || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {order.status === 'delivered' && userRole !== 'admin' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/orders/${order.id}`);
                              }}
                              title="View Only"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingOrder(order);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {orders.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No orders yet</p>
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
                        onChange={(e) => {
                          const value = e.target.value;
                          setPhoneNumber(value);
                          setShowOrderFields(value.replace(/\D/g, '').length >= 9);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input id="company_name" name="company_name" />
                    </div>

                    {showOrderFields && (
                      <>
                        <div className="pt-4 border-t">
                          <h3 className="font-semibold mb-4">Create Order (Optional)</h3>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="job_title">Job Title</Label>
                          <Input id="job_title" name="job_title" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description / Notes</Label>
                          <Textarea id="description" name="description" rows={3} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="order_value">Order Value</Label>
                          <Input id="order_value" name="order_value" type="number" step="0.01" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="delivery_date">Delivery Date</Label>
                          <Input id="delivery_date" name="delivery_date" type="date" />
                        </div>
                      </>
                    )}

                    <Button type="submit" className="w-full">
                      {showOrderFields ? 'Add Customer & Order' : 'Add Customer'}
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
                      <TableHead className="min-w-[150px]">Customer Name</TableHead>
                      <TableHead className="min-w-[150px]">Contact</TableHead>
                      <TableHead className="text-center min-w-[120px]">Total Orders</TableHead>
                      <TableHead className="text-right min-w-[120px]">Total Spent</TableHead>
                      <TableHead className="min-w-[120px]">Last Order</TableHead>
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
                        <TableCell className="text-center">{customer.total_orders || 0}</TableCell>
                        <TableCell className="text-right font-bold">
                          ${(customer.total_spent || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {customer.last_order_date 
                            ? new Date(customer.last_order_date).toLocaleDateString()
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
