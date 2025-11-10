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
import { Package, Users, DollarSign, AlertCircle, Calendar as CalendarIcon, Download, Activity } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { generateDailyActivityPDF } from '@/utils/generateDailyActivityPDF';
import { useAuth } from '@/contexts/AuthContext';

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
}

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
        .select('*, orders(job_title, customers(name))')
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
        .select('id, name')
        .order('name');

      setCustomers(customersData || []);

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
      <div className="space-y-4 sm:space-y-6 w-full max-w-full">
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
    </div>
    </Layout>
  );
}
