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
import { Printer, Package, CheckCircle2, Clock, Eye, Paperclip, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  totalCommissions: number;
  paidCommissions: number;
}

const PrintOperatorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({ 
    readyForPrint: 0, 
    printing: 0, 
    printed: 0, 
    delivered: 0,
    totalCommissions: 0,
    paidCommissions: 0
  });
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date>(new Date());

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
          filter: `status=in.(ready_for_print,designed,printing,printed)`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.status === 'ready_for_print' || payload.new.status === 'designed') {
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

      // Fetch commissions for print operator
      const { data: commissionsData } = await supabase
        .from('commissions')
        .select(`
          *,
          orders (job_title, order_value, customers(name))
        `)
        .eq('user_id', user?.id)
        .eq('commission_type', 'print')
        .order('created_at', { ascending: false });

      setCommissions(commissionsData || []);

      const totalCommissions = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const paidCommissions = commissionsData?.filter(c => c.paid_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;

      // Fetch orders filtered by date
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();
      
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .in('status', ['ready_for_print', 'designed', 'printing', 'printed', 'ready_for_collection', 'on_hold' as any])
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (ordersData) {
        // Batch fetch all unique designer profiles in a single query
        const designerIds = [...new Set(ordersData.map(o => o.designer_id).filter(Boolean))];
        
        let designerMap = new Map();
        if (designerIds.length > 0) {
          const { data: designerData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', designerIds);
          
          designerMap = new Map((designerData || []).map(p => [p.id, p]));
        }

        // Batch fetch file counts for all orders
        const orderIds = ordersData.map(o => o.id);
        const { data: fileCountsData } = await supabase
          .from('order_files')
          .select('order_id')
          .in('order_id', orderIds);
        
        const fileCountMap = new Map();
        (fileCountsData || []).forEach(file => {
          fileCountMap.set(file.order_id, (fileCountMap.get(file.order_id) || 0) + 1);
        });

        const ordersWithDesigner = ordersData.map(order => ({
          ...order,
          customer: order.customers,
          designer: order.designer_id ? designerMap.get(order.designer_id) || null : null,
          file_count: fileCountMap.get(order.id) || 0,
        }));

        setOrders(ordersWithDesigner as any);

        // Calculate stats
        const readyForPrint = ordersWithDesigner.filter(o => o.status === 'ready_for_print' || o.status === 'designed').length;
        const printing = ordersWithDesigner.filter(o => o.status === 'printing').length;
        const printed = ordersWithDesigner.filter(o => o.status === 'printed').length;
        const delivered = ordersWithDesigner.filter(o => o.status === 'delivered').length;

        setStats({ 
          readyForPrint, 
          printing, 
          printed, 
          delivered,
          totalCommissions,
          paidCommissions
        });
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
      ready_for_print: { label: 'Ready for Print', className: 'bg-info text-info-foreground' },
      designed: { label: 'Ready for Print', className: 'bg-info text-info-foreground' },
      printing: { label: 'Printing', className: 'bg-primary text-primary-foreground' },
      printed: { label: 'Printed', className: 'bg-success text-success-foreground' },
      ready_for_collection: { label: 'Ready for Collection', className: 'bg-info text-info-foreground' },
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
      <div className="space-y-4 sm:space-y-6 w-full max-w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Print Operator Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage print jobs and deliveries</p>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
              <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
              <DollarSign className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalCommissions.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                ${stats.paidCommissions.toFixed(2)} paid
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="jobs" className="w-full">
          <TabsList>
            <TabsTrigger value="jobs">Print Jobs</TabsTrigger>
            <TabsTrigger value="commissions">My Commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle>Print Jobs</CardTitle>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !dateFilter && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFilter ? format(dateFilter, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFilter}
                        onSelect={(date) => {
                          if (date) {
                            setDateFilter(date);
                            fetchPrintData();
                          }
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
          <CardContent className="overflow-x-auto custom-scrollbar">
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
                    <TableHead className="min-w-[150px]">Job Title</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[150px]">Designer</TableHead>
                    <TableHead className="min-w-[120px]">Print Type</TableHead>
                    <TableHead className="min-w-[100px]">Quantity</TableHead>
                    <TableHead className="min-w-[80px]">Files</TableHead>
                    <TableHead className="min-w-[130px]">Delivery Date</TableHead>
                    <TableHead className="min-w-[120px]">Status</TableHead>
                    <TableHead className="min-w-[120px]">Actions</TableHead>
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
          </TabsContent>

          <TabsContent value="commissions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>My Print Commissions</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Order Value</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No commissions found. Make sure your commission percentage is set in your profile.
                        </TableCell>
                      </TableRow>
                    ) : (
                      commissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell className="font-medium">
                            {commission.orders?.job_title || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {commission.orders?.customers?.name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            ${commission.orders?.order_value?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell>{commission.commission_percentage}%</TableCell>
                          <TableCell className="font-bold">
                            ${commission.commission_amount.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={commission.paid_status === 'paid' ? 'default' : 'secondary'}>
                              {commission.paid_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.created_at), 'PP')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default PrintOperatorDashboard;
