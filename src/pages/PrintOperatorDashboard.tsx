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
import { Printer, Package, CheckCircle2, Clock, Eye, Paperclip, Calendar as CalendarIcon, DollarSign, Download, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface SalesRequest {
  id: string;
  customer_name: string;
  company_name: string | null;
  description: string;
  notes: string | null;
  status: string;
  created_at: string;
  designer: { full_name: string } | null;
  files: { id: string; file_name: string; file_path: string }[];
}

interface Stats {
  readyForPrint: number;
  printing: number;
  printed: number;
  delivered: number;
  totalCommissions: number;
  paidCommissions: number;
  salesRequestsInPrint: number;
  salesRequestsPrinted: number;
}

const PrintOperatorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesRequests, setSalesRequests] = useState<SalesRequest[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({ 
    readyForPrint: 0, 
    printing: 0, 
    printed: 0, 
    delivered: 0,
    totalCommissions: 0,
    paidCommissions: 0,
    salesRequestsInPrint: 0,
    salesRequestsPrinted: 0
  });
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date>(new Date());
  const [selectedRequest, setSelectedRequest] = useState<SalesRequest | null>(null);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  const [markingPrinted, setMarkingPrinted] = useState(false);

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

      // Fetch orders filtered by date AND assigned to this print operator
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();
      
      // Only fetch orders assigned to this print operator
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .eq('print_operator_id', user?.id)
        .in('status', ['ready_for_print', 'designed', 'printing', 'printed', 'ready_for_collection', 'on_hold' as any])
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      // Fetch sales order requests assigned to this print operator
      const { data: salesRequestsData } = await supabase
        .from('sales_order_requests')
        .select('*')
        .eq('print_operator_id', user?.id)
        .in('status', ['in_print', 'printed'])
        .order('created_at', { ascending: false });

      let salesRequestsWithFiles: SalesRequest[] = [];
      if (salesRequestsData && salesRequestsData.length > 0) {
        // Fetch designer info
        const designerIds = [...new Set(salesRequestsData.map(r => r.designer_id).filter(Boolean))];
        let designerMap = new Map();
        if (designerIds.length > 0) {
          const { data: designerData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', designerIds);
          designerMap = new Map((designerData || []).map(p => [p.id, p]));
        }

        // Fetch files for all requests
        const requestIds = salesRequestsData.map(r => r.id);
        const { data: filesData } = await supabase
          .from('request_files')
          .select('id, request_id, file_name, file_path')
          .in('request_id', requestIds);

        const filesMap = new Map<string, { id: string; file_name: string; file_path: string }[]>();
        (filesData || []).forEach(file => {
          if (!filesMap.has(file.request_id)) {
            filesMap.set(file.request_id, []);
          }
          filesMap.get(file.request_id)!.push({
            id: file.id,
            file_name: file.file_name,
            file_path: file.file_path
          });
        });

        salesRequestsWithFiles = salesRequestsData.map(request => ({
          id: request.id,
          customer_name: request.customer_name,
          company_name: request.company_name,
          description: request.description,
          notes: request.notes,
          status: request.status,
          created_at: request.created_at,
          designer: request.designer_id ? designerMap.get(request.designer_id) || null : null,
          files: filesMap.get(request.id) || []
        }));
      }

      setSalesRequests(salesRequestsWithFiles);

      // Calculate sales request stats
      const salesRequestsInPrint = salesRequestsWithFiles.filter(r => r.status === 'in_print').length;
      const salesRequestsPrinted = salesRequestsWithFiles.filter(r => r.status === 'printed').length;

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
          paidCommissions,
          salesRequestsInPrint,
          salesRequestsPrinted
        });
      } else {
        setStats({ 
          readyForPrint: 0, 
          printing: 0, 
          printed: 0, 
          delivered: 0,
          totalCommissions,
          paidCommissions,
          salesRequestsInPrint,
          salesRequestsPrinted
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
      in_print: { label: 'In Print', className: 'bg-primary text-primary-foreground' },
    };
    const config = statusMap[status] || { label: status, className: 'bg-secondary' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const handleMarkPrinted = async (requestId: string) => {
    try {
      setMarkingPrinted(true);
      const { error } = await supabase
        .from('sales_order_requests')
        .update({ status: 'printed' })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Job marked as printed',
      });

      fetchPrintData();
      setFilesDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setMarkingPrinted(false);
    }
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('request-files')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
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

        <Tabs defaultValue="sales-requests" className="w-full">
          <TabsList>
            <TabsTrigger value="sales-requests">
              Sales Requests
              {stats.salesRequestsInPrint > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">{stats.salesRequestsInPrint}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs">Print Jobs</TabsTrigger>
            <TabsTrigger value="commissions">My Commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="sales-requests" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Sales Requests to Print</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto custom-scrollbar">
                {salesRequests.filter(r => r.status === 'in_print').length === 0 ? (
                  <div className="text-center py-12">
                    <Printer className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No print jobs</h3>
                    <p className="text-muted-foreground">
                      Jobs assigned to you will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Customer</TableHead>
                        <TableHead className="min-w-[150px]">Company</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="min-w-[150px]">Designer</TableHead>
                        <TableHead className="min-w-[80px]">Files</TableHead>
                        <TableHead className="min-w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[180px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRequests.filter(r => r.status === 'in_print').map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.customer_name}</TableCell>
                          <TableCell>{request.company_name || 'N/A'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{request.description}</TableCell>
                          <TableCell>{request.designer?.full_name || 'N/A'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <span className={request.files.length > 0 ? 'font-medium' : ''}>
                                {request.files.length}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(request.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setFilesDialogOpen(true);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Files
                              </Button>
                              <Button 
                                size="sm"
                                onClick={() => handleMarkPrinted(request.id)}
                                disabled={markingPrinted}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Mark Printed
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

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

      {/* Files Dialog */}
      <Dialog open={filesDialogOpen} onOpenChange={setFilesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Design Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRequest && (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>Customer:</strong> {selectedRequest.customer_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Description:</strong> {selectedRequest.description}
                  </p>
                  {selectedRequest.notes && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Notes:</strong> {selectedRequest.notes}
                    </p>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Files ({selectedRequest.files.length})</h4>
                  {selectedRequest.files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No files uploaded</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRequest.files.map((file) => (
                        <div 
                          key={file.id} 
                          className="flex items-center justify-between p-2 border rounded"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{file.file_name}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadFile(file.file_path, file.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedRequest.status === 'in_print' && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button 
                      onClick={() => handleMarkPrinted(selectedRequest.id)}
                      disabled={markingPrinted}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Printed
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default PrintOperatorDashboard;
