import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import DesignerDashboard from './DesignerDashboard';
import SalesDashboard from './SalesDashboard';
import PrintOperatorDashboard from './PrintOperatorDashboard';
import AdminDashboard from './AdminDashboard';
import AccountantDashboard from './AccountantDashboard';

interface DashboardStats {
  totalSales: number;
  pendingJobs: number;
  completedJobs: number;
  totalCommissions: number;
  totalExpenses: number;
  netIncome: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    pendingJobs: 0,
    completedJobs: 0,
    totalCommissions: 0,
    totalExpenses: 0,
    netIncome: 0,
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
        

        // Get orders data
        const { data: orders } = await supabase
          .from('orders')
          .select('order_value, status');

        const pendingJobs = orders?.filter(o => o.status === 'pending' || o.status === 'designing').length || 0;
        const completedJobs = orders?.filter(o => o.status === 'delivered').length || 0;

        // Get total payments (actual money collected)
        const { data: payments } = await supabase
          .from('payments')
          .select('amount');

        const totalSales = payments?.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) || 0;

        // Get total expenses
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount');

        const totalExpenses = expenses?.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || 0;

        // Calculate net income
        const netIncome = totalSales - totalExpenses;

        // Get user's commissions
        const { data: commissions } = await supabase
          .from('commissions')
          .select('commission_amount')
          .eq('user_id', user?.id);

        const totalCommissions = commissions?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;

        setStats({
          totalSales,
          pendingJobs,
          completedJobs,
          totalCommissions,
          totalExpenses,
          netIncome,
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
      title: 'Total Revenue',
      value: `$${stats.totalSales.toFixed(2)}`,
      icon: DollarSign,
      description: 'Payments collected',
      color: 'text-success',
    },
    {
      title: 'Total Expenses',
      value: `$${stats.totalExpenses.toFixed(2)}`,
      icon: Package,
      description: 'Business expenses',
      color: 'text-destructive',
    },
    {
      title: 'Net Income',
      value: `$${stats.netIncome.toFixed(2)}`,
      icon: DollarSign,
      description: 'Revenue - Expenses',
      color: stats.netIncome >= 0 ? 'text-success' : 'text-destructive',
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

  // Render admin dashboard for admins
  if (userRole === 'admin') {
    return <AdminDashboard />;
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

  // Render accountant dashboard for accountants
  if (userRole === 'accountant') {
    return <AccountantDashboard />;
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
