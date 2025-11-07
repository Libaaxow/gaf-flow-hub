import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

const Reports = () => {
  const [salespeople, setSalespeople] = useState<SalespersonReport[]>([]);
  const [customers, setCustomers] = useState<CustomerReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      // Fetch salesperson reports
      const { data: commissions } = await supabase
        .from('commissions')
        .select(`
          salesperson_id,
          commission_amount,
          orders (order_value),
          profiles:salesperson_id (id, full_name)
        `);

      const salesMap = new Map<string, SalespersonReport>();
      
      commissions?.forEach((commission: any) => {
        const id = commission.profiles?.id;
        if (!id) return;

        if (!salesMap.has(id)) {
          salesMap.set(id, {
            id,
            full_name: commission.profiles.full_name,
            totalSales: 0,
            totalCommission: 0,
            orderCount: 0,
          });
        }

        const report = salesMap.get(id)!;
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
                    <div key={customer.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div>
                        <h3 className="font-semibold">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {customer.orderCount} orders
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ${customer.totalSpent.toFixed(2)}
                        </p>
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
      </div>
    </Layout>
  );
};

export default Reports;
