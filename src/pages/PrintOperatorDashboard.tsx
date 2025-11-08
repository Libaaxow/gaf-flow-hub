import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Printer, Package, CheckCircle2, Clock, Eye, Paperclip } from 'lucide-react';

interface Order {
  id: string;
  job_title: string;
  status: string;
  delivery_date: string | null;
  quantity: number;
  print_type: string | null;
  created_at: string;
  customer: { name: string } | null;
  designer: { full_name: string } | null;
  file_count?: number;
}

interface Stats {
  readyForPrint: number;
  printing: number;
  printed: number;
  delivered: number;
}

const PrintOperatorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>({ readyForPrint: 0, printing: 0, printed: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchUserRole();
      fetchPrintData();
      setupRealtimeSubscription();
    }
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
      .channel('print-operator-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `status=in.(designed,printing,printed)`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.status === 'designed') {
              // Fetch designer info for the new job
              let designerName = 'Unknown';
              if (payload.new.designer_id) {
                const { data } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', payload.new.designer_id)
                  .single();
                designerName = data?.full_name || 'Unknown';
              }

              toast({
                title: 'New Job Ready for Print',
                description: `${payload.new.job_title} from ${designerName}`,
              });
            }
          }
          fetchPrintData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchPrintData = async () => {
    try {
      setLoading(true);

      // Fetch orders ready for print or in printing stages
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .in('status', ['designed', 'printing', 'printed', 'on_hold' as any])
        .order('created_at', { ascending: false });

      if (ordersData) {
        // Fetch designer data and file count for each order
        const ordersWithDesigner = await Promise.all(
          ordersData.map(async (order) => {
            let designer = null;
            if (order.designer_id) {
              const { data: designerData } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', order.designer_id)
                .single();
              designer = designerData;
            }
            
            // Fetch file count
            const { count: fileCount } = await supabase
              .from('order_files')
              .select('*', { count: 'exact', head: true })
              .eq('order_id', order.id);
            
            return { ...order, customer: order.customers, designer, file_count: fileCount || 0 };
          })
        );

        setOrders(ordersWithDesigner as any);

        // Calculate stats
        const readyForPrint = ordersWithDesigner.filter(o => o.status === 'designed').length;
        const printing = ordersWithDesigner.filter(o => o.status === 'printing').length;
        const printed = ordersWithDesigner.filter(o => o.status === 'printed').length;
        const delivered = ordersWithDesigner.filter(o => o.status === 'delivered').length;

        setStats({ readyForPrint, printing, printed, delivered });
      }
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      designed: { label: 'Ready for Print', className: 'bg-info text-info-foreground' },
      printing: { label: 'Printing', className: 'bg-primary text-primary-foreground' },
      printed: { label: 'Printed', className: 'bg-success text-success-foreground' },
      on_hold: { label: 'On Hold', className: 'bg-destructive text-destructive-foreground' },
      delivered: { label: 'Delivered', className: 'bg-success text-success-foreground' },
    };
    const config = statusMap[status] || { label: status, className: 'bg-secondary' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Print Operator Dashboard</h1>
          <p className="text-muted-foreground">Manage print jobs and deliveries</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ready for Print</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.readyForPrint}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Printing</CardTitle>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.printing}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Printed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.printed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delivered}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Print Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <Printer className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No print jobs</h3>
                <p className="text-muted-foreground">
                  Jobs ready for print will appear here
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Designer</TableHead>
                    <TableHead>Print Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow 
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <TableCell className="font-medium">{order.job_title}</TableCell>
                      <TableCell>{order.customer?.name || 'N/A'}</TableCell>
                      <TableCell>{order.designer?.full_name || 'N/A'}</TableCell>
                      <TableCell>{order.print_type || 'N/A'}</TableCell>
                      <TableCell>{order.quantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className={order.file_count && order.file_count > 0 ? 'font-medium' : ''}>
                            {order.file_count || 0}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.delivery_date 
                          ? new Date(order.delivery_date).toLocaleDateString()
                          : 'Not set'
                        }
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.id}`);
                            }}
                          >
                            Manage
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PrintOperatorDashboard;
