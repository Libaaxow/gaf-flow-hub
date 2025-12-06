import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  User, 
  Phone, 
  Building2, 
  DollarSign,
  TrendingUp,
  Gift,
  Heart,
  Package,
  Calendar,
  FileText
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, isAfter } from 'date-fns';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  company_name: string | null;
  email: string | null;
  created_at: string;
}

interface Order {
  id: string;
  job_title: string;
  order_value: number;
  amount_paid: number;
  payment_status: string;
  status: string;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  invoice_date: string;
}

type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

const CustomerAnalytics = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  useEffect(() => {
    if (customerId) {
      fetchCustomerData();
    }
  }, [customerId]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);

      // Fetch customer
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData);

      // Fetch orders with all needed fields
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, job_title, order_value, amount_paid, payment_status, status, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Fetch invoices with all needed fields
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, amount_paid, status, invoice_date')
        .eq('customer_id', customerId)
        .order('invoice_date', { ascending: false });

      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData || []);
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

  // Get filter start date based on selected filter
  const getFilterStartDate = (filter: DateFilter): Date | null => {
    const now = new Date();
    switch (filter) {
      case 'daily':
        return startOfDay(now);
      case 'weekly':
        return startOfWeek(now, { weekStartsOn: 1 });
      case 'monthly':
        return startOfMonth(now);
      case 'yearly':
        return startOfYear(now);
      case 'all':
      default:
        return null;
    }
  };

  // Filter orders based on date filter
  const filteredOrders = useMemo(() => {
    const startDate = getFilterStartDate(dateFilter);
    if (!startDate) return orders;
    return orders.filter(order => isAfter(new Date(order.created_at), startDate));
  }, [orders, dateFilter]);

  // Filter invoices based on date filter
  const filteredInvoices = useMemo(() => {
    const startDate = getFilterStartDate(dateFilter);
    if (!startDate) return invoices;
    return invoices.filter(invoice => isAfter(new Date(invoice.invoice_date), startDate));
  }, [invoices, dateFilter]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Customer not found</p>
          <Button onClick={() => navigate('/customers')} className="mt-4">
            Back to Customers
          </Button>
        </div>
      </Layout>
    );
  }

  // Calculate metrics from BOTH orders AND invoices
  // Use orders if available, otherwise fall back to invoices
  const orderRevenue = filteredOrders.reduce((sum, order) => sum + (order.order_value || 0), 0);
  const orderPaid = filteredOrders.reduce((sum, order) => sum + (order.amount_paid || 0), 0);
  
  // Invoice-based metrics
  const invoiceTotal = filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const invoicePaid = filteredInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  
  // Use whichever source has data (prefer invoices as they're more accurate for financial tracking)
  const totalRevenue = invoiceTotal > 0 ? invoiceTotal : orderRevenue;
  const totalPaid = invoicePaid > 0 ? invoicePaid : orderPaid;
  const totalOutstanding = totalRevenue - totalPaid;
  
  const totalOrders = filteredOrders.length;
  const totalInvoiceCount = filteredInvoices.length;
  const averageValue = totalInvoiceCount > 0 
    ? invoiceTotal / totalInvoiceCount 
    : (totalOrders > 0 ? orderRevenue / totalOrders : 0);
  
  // Calculate loyalty score (0-100) - using all-time data for consistency
  const allTimeInvoiceTotal = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const allTimeInvoicePaid = invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
  const allTimeOrderRevenue = orders.reduce((sum, order) => sum + (order.order_value || 0), 0);
  const allTimeOrderPaid = orders.reduce((sum, order) => sum + (order.amount_paid || 0), 0);
  
  const allTimeRevenue = allTimeInvoiceTotal > 0 ? allTimeInvoiceTotal : allTimeOrderRevenue;
  const allTimePaid = allTimeInvoicePaid > 0 ? allTimeInvoicePaid : allTimeOrderPaid;
  
  const daysSinceFirstOrder = customer.created_at ? 
    Math.floor((Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const totalTransactions = Math.max(orders.length, invoices.length);
  const transactionsPerMonth = daysSinceFirstOrder > 0 ? (totalTransactions / (daysSinceFirstOrder / 30)) : 0;
  const paymentRate = allTimeRevenue > 0 ? (allTimePaid / allTimeRevenue) * 100 : 0;
  const loyaltyScore = Math.min(100, Math.round(
    (transactionsPerMonth * 20) + (paymentRate * 0.3) + (totalTransactions * 2)
  ));

  // Get loyalty level
  const getLoyaltyLevel = (score: number) => {
    if (score >= 80) return { label: 'VIP', color: 'bg-gradient-to-r from-yellow-500 to-orange-500', icon: '👑' };
    if (score >= 60) return { label: 'Gold', color: 'bg-gradient-to-r from-yellow-400 to-yellow-600', icon: '⭐' };
    if (score >= 40) return { label: 'Silver', color: 'bg-gradient-to-r from-gray-300 to-gray-500', icon: '🥈' };
    return { label: 'Bronze', color: 'bg-gradient-to-r from-amber-600 to-amber-800', icon: '🥉' };
  };

  const loyaltyLevel = getLoyaltyLevel(loyaltyScore);

  // Prepare revenue over time data - use invoices if available, otherwise orders
  const revenueSource = filteredInvoices.length > 0 ? filteredInvoices : filteredOrders;
  const revenueByPeriod = revenueSource.reduce((acc, item) => {
    let periodKey: string;
    const itemDate = new Date('invoice_date' in item ? item.invoice_date : item.created_at);
    
    switch (dateFilter) {
      case 'daily':
        periodKey = format(itemDate, 'HH:00');
        break;
      case 'weekly':
        periodKey = format(itemDate, 'EEE');
        break;
      case 'monthly':
        periodKey = format(itemDate, 'dd MMM');
        break;
      case 'yearly':
        periodKey = format(itemDate, 'MMM');
        break;
      default:
        periodKey = format(itemDate, 'MMM yyyy');
    }
    
    if (!acc[periodKey]) {
      acc[periodKey] = 0;
    }
    const amount = 'total_amount' in item ? item.total_amount : item.order_value;
    acc[periodKey] += amount || 0;
    return acc;
  }, {} as Record<string, number>);

  const revenueData = Object.entries(revenueByPeriod)
    .map(([period, revenue]) => ({ period, revenue }));

  // Invoice status breakdown
  const invoiceStatusData = filteredInvoices.reduce((acc, invoice) => {
    const status = invoice.status || 'unknown';
    const existing = acc.find(item => item.name === status);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: status, value: 1 });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  // Payment status breakdown - combine orders and invoices
  const paymentStatusData: Array<{ name: string; value: number }> = [];
  
  if (filteredInvoices.length > 0) {
    filteredInvoices.forEach(inv => {
      const status = inv.status === 'paid' ? 'paid' : (inv.amount_paid > 0 ? 'partial' : 'unpaid');
      const existing = paymentStatusData.find(item => item.name === status);
      if (existing) {
        existing.value += 1;
      } else {
        paymentStatusData.push({ name: status, value: 1 });
      }
    });
  } else if (filteredOrders.length > 0) {
    filteredOrders.forEach(order => {
      const status = order.payment_status || 'unknown';
      const existing = paymentStatusData.find(item => item.name === status);
      if (existing) {
        existing.value += 1;
      } else {
        paymentStatusData.push({ name: status, value: 1 });
      }
    });
  }

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const getFilterLabel = (filter: DateFilter) => {
    switch (filter) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'yearly': return 'This Year';
      case 'all': return 'All Time';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <User className="h-8 w-8" />
                {customer.name}
              </h1>
              <p className="text-muted-foreground">Customer Analytics & Insights</p>
            </div>
          </div>
          <Badge className={`${loyaltyLevel.color} text-white text-lg px-4 py-2`}>
            {loyaltyLevel.icon} {loyaltyLevel.label} Customer
          </Badge>
        </div>

        {/* Date Filter Tabs */}
        <Card>
          <CardContent className="pt-4">
            <Tabs value={dateFilter} onValueChange={(value) => setDateFilter(value as DateFilter)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
                <TabsTrigger value="all">All Time</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Customer Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{customer.name}</p>
                </div>
              </div>
              {customer.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{customer.phone}</p>
                  </div>
                </div>
              )}
              {customer.company_name && (
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="font-medium">{customer.company_name}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Customer Since</p>
                  <p className="font-medium">{format(new Date(customer.created_at), 'PP')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">${totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {getFilterLabel(dateFilter)} • Paid: ${totalPaid.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-orange-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">${totalOutstanding.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalOutstanding > 0 ? 'Needs collection' : 'All paid up!'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {totalInvoiceCount > 0 ? 'Total Invoices' : 'Total Orders'}
              </CardTitle>
              {totalInvoiceCount > 0 ? (
                <FileText className="h-4 w-4 text-green-500" />
              ) : (
                <Package className="h-4 w-4 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {totalInvoiceCount > 0 ? totalInvoiceCount : totalOrders}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {getFilterLabel(dateFilter)} • Avg: ${averageValue.toFixed(0)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loyalty Score</CardTitle>
              <Heart className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-500">{loyaltyScore}/100</div>
              <p className="text-xs text-muted-foreground mt-1">
                {loyaltyScore >= 60 ? 'Excellent loyalty!' : 'Building relationship'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recommendations Card */}
        {loyaltyScore >= 60 && (
          <Card className="border-yellow-500/40 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-yellow-600" />
                Customer Appreciation Recommendations
              </CardTitle>
              <CardDescription>
                This {loyaltyLevel.label} customer deserves special recognition
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 mt-2" />
                  <div>
                    <p className="font-medium">Send Thank You Card</p>
                    <p className="text-sm text-muted-foreground">
                      Express gratitude for ${allTimeRevenue.toLocaleString()} in total business
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 mt-2" />
                  <div>
                    <p className="font-medium">Offer {loyaltyScore >= 80 ? '15%' : '10%'} Loyalty Discount</p>
                    <p className="text-sm text-muted-foreground">
                      Valid on next order as appreciation
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 mt-2" />
                  <div>
                    <p className="font-medium">Priority Service</p>
                    <p className="text-sm text-muted-foreground">
                      Fast-track processing for future orders
                    </p>
                  </div>
                </div>
                {loyaltyScore >= 80 && (
                  <div className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-yellow-500 mt-2" />
                    <div>
                      <p className="font-medium">VIP Gift Package</p>
                      <p className="text-sm text-muted-foreground">
                        Consider branded merchandise or special gift
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Revenue Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Over Time</CardTitle>
              <CardDescription>{getFilterLabel(dateFilter)} revenue breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Revenue']} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Revenue ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data for {getFilterLabel(dateFilter).toLowerCase()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Status</CardTitle>
              <CardDescription>Payment distribution - {getFilterLabel(dateFilter)}</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {paymentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No data for {getFilterLabel(dateFilter).toLowerCase()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invoice Status Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Overview</CardTitle>
            <CardDescription>{totalInvoiceCount} invoices - {getFilterLabel(dateFilter)}</CardDescription>
          </CardHeader>
          <CardContent>
            {invoiceStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={invoiceStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="hsl(var(--primary))" name="Invoice Count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No invoices for {getFilterLabel(dateFilter).toLowerCase()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        {filteredInvoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Invoices - {getFilterLabel(dateFilter)}</CardTitle>
              <CardDescription>{filteredInvoices.length} invoices found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredInvoices.slice(0, 10).map((invoice) => (
                  <div 
                    key={invoice.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(invoice.invoice_date), 'PP')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${(invoice.total_amount || 0).toLocaleString()}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Paid: ${(invoice.amount_paid || 0).toLocaleString()}
                        </span>
                        <Badge 
                          variant={
                            invoice.status === 'paid' ? 'default' : 
                            invoice.status === 'partial' ? 'secondary' : 'destructive'
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Orders */}
        {filteredOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Orders - {getFilterLabel(dateFilter)}</CardTitle>
              <CardDescription>{filteredOrders.length} orders found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredOrders.slice(0, 10).map((order) => (
                  <div 
                    key={order.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <Package className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{order.job_title}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(order.created_at), 'PPp')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${(order.order_value || 0).toLocaleString()}</p>
                      <Badge 
                        variant={
                          order.payment_status === 'paid' ? 'default' : 
                          order.payment_status === 'partial' ? 'secondary' : 'destructive'
                        }
                      >
                        {order.payment_status || 'unpaid'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {filteredOrders.length === 0 && filteredInvoices.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                No orders or invoices found for {getFilterLabel(dateFilter).toLowerCase()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default CustomerAnalytics;
