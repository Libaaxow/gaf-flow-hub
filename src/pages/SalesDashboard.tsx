import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, Users, Package, CheckCircle, Clock, Plus, TrendingUp, Edit } from 'lucide-react';
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
  total_orders?: number;
  total_spent?: number;
  last_order_date?: string | null;
}

interface Order {
  id: string;
  job_title: string;
  description: string | null;
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
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showOrderFields, setShowOrderFields] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [designers, setDesigners] = useState<any[]>([]);

  useEffect(() => {
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
      // Fetch customers created by this salesperson
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('created_by', user?.id)
        .order('created_at', { ascending: false });

      if (customersError) throw customersError;

      // Fetch orders for this salesperson
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name)
        `)
        .eq('salesperson_id', user?.id)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch designer names for orders
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
          return { ...order, designer_name: null };
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
        o.status === 'pending' || o.status === 'designing' || o.status === 'designed' || o.status === 'printing'
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

      setCustomers(customersWithStats);
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
    const formData = new FormData(e.currentTarget);
    
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
      e.currentTarget.reset();
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

  const handleAddOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const orderData = {
      customer_id: formData.get('customer_id') as string,
      job_title: formData.get('job_title') as string,
      description: formData.get('description') as string,
      order_value: parseFloat(formData.get('order_value') as string),
      salesperson_id: user?.id,
      designer_id: (formData.get('designer_id') as string) || null,
      delivery_date: formData.get('delivery_date') as string || null,
    };

    try {
      const { error } = await supabase
        .from('orders')
        .insert([orderData]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order created successfully',
      });

      e.currentTarget.reset();
      setIsOrderDialogOpen(false);
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEditOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingOrder) return;

    const formData = new FormData(e.currentTarget);
    
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
      e.currentTarget.reset();
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
      pending: 'bg-warning',
      designing: 'bg-info',
      designed: 'bg-info',
      approved: 'bg-success',
      printing: 'bg-primary',
      printed: 'bg-success',
      delivered: 'bg-success',
    };
    return colors[status] || 'bg-secondary';
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

  const topCustomers = [...customers]
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
      <div className="space-y-6">
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
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
        <div className="grid gap-4 md:grid-cols-2">
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
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Total Orders</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
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
          <TabsList>
            <TabsTrigger value="orders">My Orders</TabsTrigger>
            <TabsTrigger value="customers">My Customers</TabsTrigger>
            <TabsTrigger value="commissions">Commission Tracker</TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Orders / Jobs</h2>
              <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Job Request
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Job Request</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddOrder} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_id">Customer *</Label>
                      <Select name="customer_id" required>
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
                    <div className="space-y-2">
                      <Label htmlFor="job_title">Job Title *</Label>
                      <Input id="job_title" name="job_title" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description / Notes</Label>
                      <Textarea id="description" name="description" rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_value">Order Value *</Label>
                      <Input id="order_value" name="order_value" type="number" step="0.01" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="designer_id">Assign Designer</Label>
                      <Select name="designer_id">
                        <SelectTrigger>
                          <SelectValue placeholder="Select designer (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {designers.map((designer) => (
                            <SelectItem key={designer.id} value={designer.id}>
                              {designer.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="delivery_date">Delivery Date</Label>
                      <Input id="delivery_date" name="delivery_date" type="date" />
                    </div>
                    <Button type="submit" className="w-full">Create Job Request</Button>
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
                      <Label htmlFor="edit_designer_id">Assign Designer</Label>
                      <Select name="designer_id" defaultValue={editingOrder.designer_id || undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select designer (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {designers.map((designer) => (
                            <SelectItem key={designer.id} value={designer.id}>
                              {designer.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Designer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
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
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Customers</h2>
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
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-center">Total Orders</TableHead>
                      <TableHead className="text-right">Total Spent</TableHead>
                      <TableHead>Last Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
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
                {customers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No customers yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <h2 className="text-2xl font-bold">Commission Tracker</h2>
            
            <div className="grid gap-4 md:grid-cols-3">
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
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Name</TableHead>
                      <TableHead className="text-right">Order Value</TableHead>
                      <TableHead className="text-center">Commission %</TableHead>
                      <TableHead className="text-right">Commission Amount</TableHead>
                      <TableHead>Payment Status</TableHead>
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
