import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Clock, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface Order {
  id: string;
  job_title: string;
  description: string;
  status: string;
  delivery_date: string;
  customer_id: string;
  salesperson_id: string;
  created_at: string;
  customers: { name: string; company_name: string };
  salesperson?: { full_name: string } | null;
}

interface Stats {
  totalJobs: number;
  completed: number;
  inProgress: number;
  awaitingApproval: number;
}

const DesignerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    completed: 0,
    inProgress: 0,
    awaitingApproval: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRole();
    fetchDesignerData();
    setupRealtimeSubscription();
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

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('designer-orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `designer_id=eq.${user?.id}`,
        },
        async (payload) => {
          // Fetch salesperson name for notification
          const { data: salespersonData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', payload.new.salesperson_id)
            .single();

          toast({
            title: '🎨 New Job Assigned!',
            description: `${payload.new.job_title} by ${salespersonData?.full_name || 'Unknown Salesperson'}`,
          });
          
          fetchDesignerData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `designer_id=eq.${user?.id}`,
        },
        () => {
          fetchDesignerData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchDesignerData = async () => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      setProfile(profileData);

      // Fetch assigned orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, customers(name, company_name)')
        .eq('designer_id', user?.id)
        .order('created_at', { ascending: false });

      if (ordersData) {
        // Fetch salesperson data separately for each order
        const ordersWithSalesperson = await Promise.all(
          ordersData.map(async (order) => {
            let salesperson = null;
            if (order.salesperson_id) {
              const { data: salesData } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', order.salesperson_id)
                .single();
              salesperson = salesData;
            }
            return { ...order, salesperson };
          })
        );

        setOrders(ordersWithSalesperson as any);

        // Calculate stats
        const totalJobs = ordersWithSalesperson.length;
        const completed = ordersWithSalesperson.filter(o => o.status === 'delivered').length;
        const inProgress = ordersWithSalesperson.filter(o => o.status === 'designing').length;
        const awaitingApproval = ordersWithSalesperson.filter(o => o.status === 'awaiting_accounting_approval').length;

        setStats({ totalJobs, completed, inProgress, awaitingApproval });
      }
    } catch (error) {
      console.error('Error fetching designer data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending_accounting_review: { label: 'Pending Accountant', variant: 'outline' },
      designing: { label: 'In Design', variant: 'default' },
      awaiting_accounting_approval: { label: 'Awaiting Approval', variant: 'secondary' },
      ready_for_print: { label: 'Ready for Print', variant: 'default' },
      printing: { label: 'Printing', variant: 'default' },
      delivered: { label: 'Completed', variant: 'secondary' },
    };

    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    if (filter === 'in-progress') return order.status === 'designing';
    if (filter === 'ready') return order.status === 'awaiting_accounting_approval';
    if (filter === 'completed') return order.status === 'delivered';
    return true;
  });

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
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src="" />
            <AvatarFallback>{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{profile?.full_name}</h1>
            <p className="text-muted-foreground">Designer Dashboard</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs Assigned</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalJobs}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jobs Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jobs In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Awaiting Approval</CardTitle>
              <AlertCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.awaitingApproval}</div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs Table with Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Assigned Jobs</CardTitle>
              <Tabs value={filter} onValueChange={setFilter} className="w-auto">
                <TabsList>
                  <TabsTrigger value="all">All Jobs</TabsTrigger>
                  <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                  <TabsTrigger value="ready">Ready for Print</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow 
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        #{order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customers.name}</div>
                          {order.customers.company_name && (
                            <div className="text-sm text-muted-foreground">
                              {order.customers.company_name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{order.job_title}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>
                        {order.delivery_date
                          ? new Date(order.delivery_date).toLocaleDateString()
                          : 'Not set'}
                      </TableCell>
                      <TableCell>{order.salesperson?.full_name || 'Unassigned'}</TableCell>
                      <TableCell>
                        {order.status === 'delivered' && userRole !== 'admin' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Manage
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default DesignerDashboard;
