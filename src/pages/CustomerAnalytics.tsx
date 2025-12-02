import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  User, 
  Phone, 
  Building2, 
  DollarSign,
  FileText,
  TrendingUp,
  Gift,
  Heart,
  Package,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
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

const CustomerAnalytics = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

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

      // Fetch orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      // Fetch invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*')
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

  // Calculate metrics
  const totalRevenue = orders.reduce((sum, order) => sum + (order.order_value || 0), 0);
  const totalPaid = orders.reduce((sum, order) => sum + (order.amount_paid || 0), 0);
  const totalOutstanding = totalRevenue - totalPaid;
  const totalOrders = orders.length;
  const totalInvoices = invoices.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  // Calculate loyalty score (0-100)
  const daysSinceFirstOrder = customer.created_at ? 
    Math.floor((Date.now() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const ordersPerMonth = daysSinceFirstOrder > 0 ? (totalOrders / (daysSinceFirstOrder / 30)) : 0;
  const paymentRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;
  const loyaltyScore = Math.min(100, Math.round(
    (ordersPerMonth * 20) + (paymentRate * 0.3) + (totalOrders * 2)
  ));

  // Get loyalty level
  const getLoyaltyLevel = (score: number) => {
    if (score >= 80) return { label: 'VIP', color: 'bg-gradient-to-r from-yellow-500 to-orange-500', icon: '👑' };
    if (score >= 60) return { label: 'Gold', color: 'bg-gradient-to-r from-yellow-400 to-yellow-600', icon: '⭐' };
    if (score >= 40) return { label: 'Silver', color: 'bg-gradient-to-r from-gray-300 to-gray-500', icon: '🥈' };
    return { label: 'Bronze', color: 'bg-gradient-to-r from-amber-600 to-amber-800', icon: '🥉' };
  };

  const loyaltyLevel = getLoyaltyLevel(loyaltyScore);

  // Prepare revenue over time data (last 6 months)
  const revenueByMonth = orders.reduce((acc, order) => {
    const month = format(new Date(order.created_at), 'MMM yyyy');
    if (!acc[month]) {
      acc[month] = 0;
    }
    acc[month] += order.order_value || 0;
    return acc;
  }, {} as Record<string, number>);

  const revenueData = Object.entries(revenueByMonth)
    .map(([month, revenue]) => ({ month, revenue }))
    .slice(-6);

  // Invoice status breakdown
  const invoiceStatusData = invoices.reduce((acc, invoice) => {
    const status = invoice.status;
    const existing = acc.find(item => item.name === status);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: status, value: 1 });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  // Payment status breakdown
  const paymentStatusData = orders.reduce((acc, order) => {
    const status = order.payment_status;
    const existing = acc.find(item => item.name === status);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: status, value: 1 });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
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
                Paid: ${totalPaid.toLocaleString()}
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
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{totalOrders}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg: ${averageOrderValue.toFixed(0)} per order
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
                {loyaltyScore >= 60 ? 'Excellent loyalty! 🎉' : 'Building relationship'}
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
                      Express gratitude for ${totalRevenue.toLocaleString()} in business
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
              <CardDescription>Last 6 months of revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
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
            </CardContent>
          </Card>

          {/* Payment Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Status</CardTitle>
              <CardDescription>Order payment distribution</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Invoice Status Chart */}
        {invoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Invoice Overview</CardTitle>
              <CardDescription>{totalInvoices} total invoices</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest 5 orders from this customer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium">{order.job_title}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(order.created_at), 'PPP')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">${order.order_value.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">
                        Paid: ${order.amount_paid.toLocaleString()}
                      </p>
                    </div>
                    <Badge className={
                      order.payment_status === 'paid' 
                        ? 'bg-green-500/10 text-green-500' 
                        : order.payment_status === 'partial'
                        ? 'bg-orange-500/10 text-orange-500'
                        : 'bg-red-500/10 text-red-500'
                    }>
                      {order.payment_status}
                    </Badge>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No orders yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default CustomerAnalytics;
