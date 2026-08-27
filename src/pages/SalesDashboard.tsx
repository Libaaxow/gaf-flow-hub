import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FileText, Plus, Clock, CheckCircle, Calendar as CalendarIcon, Send, Eye, Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { JobDetailsDialog } from '@/components/JobDetailsDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CommissionPanel } from '@/components/CommissionPanel';


interface OrderRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  company_name: string | null;
  description: string;
  notes: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
}

interface DashboardStats {
  totalRequests: number;
  pendingRequests: number;
  processedRequests: number;
  totalAmount: number;
}

// Amount is stored inside the compiled note as "Amount: 1234"
const parseAmount = (notes: string | null): number => {
  if (!notes) return 0;
  const m = notes.match(/Amount:\s*([\d.,]+)/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const formatMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


const SalesDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orderRequests, setOrderRequests] = useState<OrderRequest[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalRequests: 0,
    pendingRequests: 0,
    processedRequests: 0,
    totalAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<Date>(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [viewRequest, setViewRequest] = useState<OrderRequest | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [viewFiles, setViewFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const formFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('sales-order-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_order_requests',
          filter: `created_by=eq.${user?.id}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, dateFilter]);

  const fetchData = async () => {
    if (!user?.id) return;
    
    try {
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();

      const { data, error } = await supabase
        .from('sales_order_requests')
        .select('*')
        .eq('created_by', user.id)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrderRequests(data || []);

      // Calculate stats
      const totalRequests = data?.length || 0;
      const pendingRequests = data?.filter(r => r.status === 'pending').length || 0;
      const processedRequests = data?.filter(r => r.status === 'processed').length || 0;
      const totalAmount = (data || []).reduce((sum, r: any) => sum + parseAmount(r.notes), 0);

      setStats({
        totalRequests,
        pendingRequests,
        processedRequests,
        totalAmount,
      });
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

  const handleSubmitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    
    // Compile all fields into a structured note
    const itemName = formData.get('item_name') as string;
    const qty = formData.get('qty') as string;
    const amount = formData.get('amount') as string;
    const description = formData.get('description') as string;
    const timeNeeded = formData.get('time_needed') as string;
    const comment = formData.get('comment') as string;

    const noteParts = [
      `Item: ${itemName}`,
      `Qty: ${qty}`,
      amount ? `Amount: ${amount}` : null,
      description ? `Description: ${description}` : null,
      timeNeeded ? `Time Needed: ${timeNeeded}` : null,
      comment ? `Comment: ${comment}` : null,
    ].filter(Boolean);

    const compiledNote = noteParts.join('\n');

    const requestData = {
      customer_name: formData.get('customer_name') as string,
      customer_phone: (formData.get('customer_phone') as string) || null,
      customer_email: null,
      company_name: null,
      description: itemName, // Use item name as the main description
      notes: compiledNote,
      status: 'pending',
      created_by: user?.id,
    };

    try {
      const { data: created, error } = await supabase
        .from('sales_order_requests')
        .insert([requestData])
        .select('id')
        .single();

      if (error) throw error;

      // Upload attachments at original full resolution (no compression / resizing)
      for (const f of attachments) {
        const safeName = f.name.replace(/[^\w.\-]/g, '_');
        const path = `${created.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('request-files')
          .upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false, cacheControl: '3600' });
        if (upErr) {
          toast({ title: 'Upload failed', description: `${f.name}: ${upErr.message}`, variant: 'destructive' });
          continue;
        }
        const { error: recErr } = await supabase.from('request_files').insert({
          request_id: created.id,
          file_name: f.name,
          file_path: path,
          file_type: f.type || null,
          uploaded_by: user?.id,
        });
        if (recErr) {
          toast({ title: 'Attachment not saved', description: `${f.name}: ${recErr.message}`, variant: 'destructive' });
        }

      }

      toast({
        title: 'Success',
        description: attachments.length
          ? `Order request sent with ${attachments.length} attachment(s)`
          : 'Order request sent to accountant for processing',
      });

      setAttachments([]);
      if (formFileRef.current) formFileRef.current.value = '';
      formEl.reset();
      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const loadFiles = async () => {
      if (!viewRequest) { setViewFiles([]); return; }
      const { data } = await supabase
        .from('request_files')
        .select('*')
        .eq('request_id', viewRequest.id)
        .order('created_at', { ascending: false });
      setViewFiles(data || []);
    };
    loadFiles();
  }, [viewRequest]);

  const downloadFile = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from('request-files').createSignedUrl(filePath, 3600, { download: fileName });
    if (error || !data?.signedUrl) {
      toast({ title: 'Error', description: error?.message || 'Could not open file', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const uploadToRequest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!viewRequest || !e.target.files?.length) return;
    setUploading(true);
    for (const f of Array.from(e.target.files)) {
      const safeName = f.name.replace(/[^\w.\-]/g, '_');
      const path = `${viewRequest.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('request-files')
        .upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false, cacheControl: '3600' });
      if (upErr) {
        toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
        continue;
      }
      await supabase.from('request_files').insert({
        request_id: viewRequest.id,
        file_name: f.name,
        file_path: path,
        file_type: f.type || null,
        uploaded_by: user?.id,
      });
    }
    const { data } = await supabase.from('request_files').select('*').eq('request_id', viewRequest.id).order('created_at', { ascending: false });
    setViewFiles(data || []);
    setUploading(false);
    e.target.value = '';
    toast({ title: 'Files uploaded' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
      case 'processed':
        return <Badge className="bg-blue-500 text-white">Processed</Badge>;
      case 'in_design':
        return <Badge className="bg-purple-500 text-white">In Design</Badge>;
      case 'in_print':
        return <Badge className="bg-orange-500 text-white">In Print</Badge>;
      case 'printed':
        return <Badge className="bg-teal-500 text-white">Printed</Badge>;
      case 'collected':
        return <Badge className="bg-success text-success-foreground">Collected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.totalRequests,
      icon: FileText,
      description: 'Today\'s requests',
      color: 'text-primary',
    },
    {
      title: 'Pending',
      value: stats.pendingRequests,
      icon: Clock,
      description: 'Awaiting processing',
      color: 'text-warning',
    },
    {
      title: 'Processed',
      value: stats.processedRequests,
      icon: CheckCircle,
      description: 'Completed by accountant',
      color: 'text-success',
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

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 w-full max-w-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {user?.email?.charAt(0).toUpperCase() || 'S'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Sales Dashboard</h1>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
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
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Order Request
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Submit Order Request</DialogTitle>
                  <DialogDescription>
                    Submit customer order details. The accountant will create the customer record, invoice, and assign work.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmitRequest} className="space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Name *</Label>
                      <Input 
                        id="customer_name" 
                        name="customer_name" 
                        required 
                        placeholder="Customer name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_phone">Phone</Label>
                      <Input 
                        id="customer_phone" 
                        name="customer_phone" 
                        placeholder="Phone number"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="item_name">Item Name *</Label>
                      <Input 
                        id="item_name" 
                        name="item_name" 
                        required
                        placeholder="e.g., Business Cards, Banner"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="qty">Qty *</Label>
                      <Input 
                        id="qty" 
                        name="qty" 
                        required
                        placeholder="e.g., 100, 2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount</Label>
                      <Input 
                        id="amount" 
                        name="amount" 
                        placeholder="e.g., $50, 500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time_needed">Time Needed</Label>
                      <Input 
                        id="time_needed" 
                        name="time_needed" 
                        placeholder="e.g., 2 days, urgent"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      name="description" 
                      placeholder="Size, color, material details..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comment">Comment</Label>
                    <Textarea 
                      id="comment" 
                      name="comment" 
                      placeholder="Any special instructions or notes"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attachments">Attach Files (original quality)</Label>
                    <Input
                      id="attachments"
                      ref={formFileRef}
                      type="file"
                      multiple
                      onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Files are sent exactly as uploaded — no compression or resizing. Finance reviews them first, then forwards to print.
                    </p>
                    {attachments.length > 0 && (
                      <div className="flex flex-col gap-1 pt-1">
                        {attachments.map((f, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1 text-xs">
                            <span className="truncate flex items-center gap-1"><Paperclip className="h-3 w-3" />{f.name}</span>
                            <button type="button" onClick={() => setAttachments(attachments.filter((_, x) => x !== i))}>
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>Submitting...</>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Submit Request
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {statCards.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Commission Panel */}
        <CommissionPanel />


        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">How Order Requests Work</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Submit order requests with customer details and requirements. The accountant will review your request, 
                  create the customer record (if needed), generate the invoice, and assign the work to designers/print operators.
                  This ensures accurate financial tracking and workflow management.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle>My Order Requests</CardTitle>
            <CardDescription>
              Order requests submitted for {format(dateFilter, "MMMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orderRequests.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No order requests</h3>
                <p className="text-muted-foreground">
                  Submit your first order request for today.
                </p>
                <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Order Request
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(request.created_at), 'HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.customer_name}</p>
                            {request.company_name && (
                              <p className="text-xs text-muted-foreground">{request.company_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{request.customer_phone || '-'}</TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate">{request.description}</p>
                          {request.notes && (
                            <p className="text-xs text-muted-foreground truncate">{request.notes}</p>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewRequest(request)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Request Dialog */}
        <JobDetailsDialog
          open={!!viewRequest}
          onOpenChange={(open) => !open && setViewRequest(null)}
          request={viewRequest}
          variant="sales"
          files={viewFiles}
          onDownloadFile={downloadFile}
          onUploadFile={uploadToRequest}
          showUpload
          uploading={uploading}
        />
      </div>
    </Layout>
  );
};

export default SalesDashboard;
