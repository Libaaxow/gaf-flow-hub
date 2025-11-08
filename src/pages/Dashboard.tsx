import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import DesignerDashboard from './DesignerDashboard';
import SalesDashboard from './SalesDashboard';
import PrintOperatorDashboard from './PrintOperatorDashboard';

interface DashboardStats {
  totalSales: number;
  pendingJobs: number;
  completedJobs: number;
  totalCommissions: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    pendingJobs: 0,
    completedJobs: 0,
    totalCommissions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Check user role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user?.id)
          .single();

        if (roleData) {
          setUserRole(roleData.role);
        }
        

        // Get total sales
        const { data: orders } = await supabase
          .from('orders')
          .select('order_value, status');

        const totalSales = orders?.reduce((sum, order) => sum + Number(order.order_value || 0), 0) || 0;
        const pendingJobs = orders?.filter(o => o.status === 'pending' || o.status === 'designing').length || 0;
        const completedJobs = orders?.filter(o => o.status === 'delivered').length || 0;

        // Get user's commissions
        const { data: commissions } = await supabase
          .from('commissions')
          .select('commission_amount')
          .eq('salesperson_id', user?.id);

        const totalCommissions = commissions?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;

        setStats({
          totalSales,
          pendingJobs,
          completedJobs,
          totalCommissions,
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  const statCards = [
    {
      title: 'Total Sales',
      value: `$${stats.totalSales.toFixed(2)}`,
      icon: DollarSign,
      description: 'All time revenue',
      color: 'text-success',
    },
    {
      title: 'Pending Jobs',
      value: stats.pendingJobs,
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
    {
      title: 'My Commissions',
      value: `$${stats.totalCommissions.toFixed(2)}`,
      icon: Package,
      description: 'Your earnings',
      color: 'text-primary',
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

  // Render designer dashboard for designers
  if (userRole === 'designer') {
    return <DesignerDashboard />;
  }

  // Render print operator dashboard for print operators
  if (userRole === 'print_operator') {
    return <PrintOperatorDashboard />;
  }

  // Render sales dashboard for sales and marketing roles
  if (userRole === 'sales' || userRole === 'marketing') {
    return <SalesDashboard />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's an overview of your business.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">
              Recent orders and updates will appear here
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
