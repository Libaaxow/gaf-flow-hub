import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';

interface SalespersonReport {
  id: string;
  full_name: string;
  totalSales: number;
  totalCommission: number;
  orderCount: number;
}

interface CustomerReport {
  id: string;
  name: string;
  totalSpent: number;
  orderCount: number;
}

interface CustomerOrder {
  id: string;
  job_title: string;
  order_value: number;
  status: string;
  created_at: string;
  payment_status: string;
}

const Reports = () => {
  const navigate = useNavigate();
  const [salespeople, setSalespeople] = useState<SalespersonReport[]>([]);
  const [customers, setCustomers] = useState<CustomerReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerReport | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    fetchReports();

    // Set up realtime subscription
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, fetchReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchReports)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchReports = async () => {
    try {
      // Fetch all sales commissions
      const { data: commissions } = await supabase
        .from('commissions')
        .select(`
          user_id,
          commission_amount,
          commission_type,
          orders (order_value)
        `)
        .eq('commission_type', 'sales');

      const salesMap = new Map<string, SalespersonReport>();
      
      // Get unique user IDs
      const userIds = Array.from(new Set(commissions?.map(c => c.user_id).filter(Boolean)));
      
      // Fetch profiles for all users at once
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      commissions?.forEach((commission: any) => {
        const userId = commission.user_id;
        if (!userId) return;

        const profile = profileMap.get(userId);
        if (!profile) return;

        if (!salesMap.has(userId)) {
          salesMap.set(userId, {
            id: userId,
            full_name: profile.full_name,
            totalSales: 0,
            totalCommission: 0,
            orderCount: 0,
          });
        }

        const report = salesMap.get(userId)!;
        report.totalSales += Number(commission.orders?.order_value || 0);
        report.totalCommission += Number(commission.commission_amount || 0);
        report.orderCount += 1;
      });

      setSalespeople(Array.from(salesMap.values()));

      // Fetch customer reports
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          customer_id,
          order_value,
          customers (id, name)
        `);

      const customerMap = new Map<string, CustomerReport>();

      orders?.forEach((order: any) => {
        const id = order.customers?.id;
        if (!id) return;

        if (!customerMap.has(id)) {
          customerMap.set(id, {
            id,
            name: order.customers.name,
            totalSpent: 0,
            orderCount: 0,
          });
        }

        const report = customerMap.get(id)!;
        report.totalSpent += Number(order.order_value || 0);
        report.orderCount += 1;
      });

      setCustomers(Array.from(customerMap.values()));
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerOrders = async (customerId: string) => {
    try {
      setLoadingOrders(true);
      const { data } = await supabase
        .from('orders')
        .select('id, job_title, order_value, status, created_at, payment_status')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      setCustomerOrders(data || []);
    } catch (error) {
      console.error('Error fetching customer orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleCustomerClick = (customer: CustomerReport) => {
    setSelectedCustomer(customer);
    fetchCustomerOrders(customer.id);
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
      on_hold: 'bg-red-500',
      pending_accounting_review: 'bg-yellow-600',
      awaiting_accounting_approval: 'bg-blue-600',
      ready_for_print: 'bg-purple-600',
    };
    return colors[status] || 'bg-gray-500';
  };

  const getPaymentColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'bg-red-500',
      partial: 'bg-yellow-500',
      paid: 'bg-green-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading reports...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">View sales and commission analytics</p>
        </div>

        <Tabs defaultValue="salespeople" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="salespeople">Sales Team</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="salespeople" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sales Team Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salespeople.map((person) => (
                    <div key={person.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div>
                        <h3 className="font-semibold">{person.full_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {person.orderCount} orders
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ${person.totalSales.toFixed(2)}
                        </p>
                        <p className="text-sm text-success">
                          Commission: ${person.totalCommission.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {salespeople.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No sales data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer Spending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customers.map((customer) => (
                    <div 
                      key={customer.id} 
                      className="flex items-center justify-between border-b pb-4 last:border-0 hover:bg-muted/50 cursor-pointer transition-colors p-2 rounded-md"
                      onClick={() => handleCustomerClick(customer)}
                    >
                      <div>
                        <h3 className="font-semibold text-primary hover:underline">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {customer.orderCount} orders
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="font-semibold">
                            ${customer.totalSpent.toFixed(2)}
                          </p>
                        </div>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                  {customers.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No customer data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Customer Orders Dialog */}
        <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Orders for {selectedCustomer?.name}
              </DialogTitle>
            </DialogHeader>
            {loadingOrders ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {customerOrders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No orders found</p>
                ) : (
                  customerOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{order.job_title}</h3>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace('_', ' ')}
                          </Badge>
                          <Badge className={getPaymentColor(order.payment_status)}>
                            {order.payment_status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Created: {format(new Date(order.created_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">${order.order_value?.toFixed(2) || '0.00'}</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Reports;
