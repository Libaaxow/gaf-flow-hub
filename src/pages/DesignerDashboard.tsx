import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Clock, CheckCircle, AlertCircle, Eye, Calendar as CalendarIcon, DollarSign, Download, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

interface SalesRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  company_name: string | null;
  description: string;
  notes: string | null;
  status: string;
  designer_id: string | null;
  print_operator_id: string | null;
  created_at: string;
  created_by: string | null;
  creator?: { full_name: string } | null;
}

interface RequestFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  created_at: string;
}

interface Stats {
  totalJobs: number;
  completed: number;
  inProgress: number;
  awaitingApproval: number;
  totalCommissions: number;
  paidCommissions: number;
}

const DesignerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<SalesRequest[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    completed: 0,
    inProgress: 0,
    awaitingApproval: 0,
    totalCommissions: 0,
    paidCommissions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  
  // Dialog states
  const [selectedRequest, setSelectedRequest] = useState<SalesRequest | null>(null);
  const [requestFiles, setRequestFiles] = useState<RequestFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserRole();
    fetchDesignerData();
    
    const cleanup = setupRealtimeSubscription();
    
    return cleanup;
  }, [user, dateFilter]);

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
    if (!user?.id) return () => {};
    
    const channel = supabase
      .channel('designer-orders')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        async (payload: any) => {
          // Check if this order was just assigned to the current designer
          if (payload.new.designer_id === user?.id && payload.old.designer_id !== user?.id) {
            // Fetch customer and salesperson data for notification
            const { data: customerData } = await supabase
              .from('customers')
              .select('name')
              .eq('id', payload.new.customer_id)
              .single();

            toast({
              title: '🎨 New Job Assigned!',
              description: `${payload.new.job_title} for ${customerData?.name || 'Unknown Customer'}`,
            });
          }
          
          // Refresh data if the order involves this designer
          if (payload.new.designer_id === user?.id || payload.old.designer_id === user?.id) {
            fetchDesignerData();
          }
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

      // Fetch commissions for designer
      const { data: commissionsData } = await supabase
        .from('commissions')
        .select(`
          *,
          orders (job_title, order_value, customers(name))
        `)
        .eq('user_id', user?.id)
        .eq('commission_type', 'design')
        .order('created_at', { ascending: false });

      setCommissions(commissionsData || []);

      const totalCommissions = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const paidCommissions = commissionsData?.filter(c => c.paid_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;

      // Fetch assigned sales requests
      let query = supabase
        .from('sales_order_requests')
        .select('*')
        .eq('designer_id', user?.id);
      
      // Only apply date filter if a specific date is selected
      if (dateFilter) {
        const startDate = startOfDay(dateFilter).toISOString();
        const endDate = endOfDay(dateFilter).toISOString();
        query = query
          .gte('created_at', startDate)
          .lte('created_at', endDate);
      }
      
      const { data: requestsData } = await query.order('created_at', { ascending: false });

      if (requestsData) {
        // Batch fetch all unique creator profiles in a single query
        const creatorIds = [...new Set(requestsData.map(r => r.created_by).filter(Boolean))];
        
        let creatorMap = new Map();
        if (creatorIds.length > 0) {
          const { data: creatorData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', creatorIds);
          
          creatorMap = new Map((creatorData || []).map(p => [p.id, p]));
        }

        const requestsWithCreator = requestsData.map(request => ({
          ...request,
          creator: request.created_by ? creatorMap.get(request.created_by) || null : null,
        }));

        setRequests(requestsWithCreator as any);

        // Calculate stats
        const totalJobs = requestsWithCreator.length;
        const completed = requestsWithCreator.filter(r => r.status === 'printed' || r.status === 'collected').length;
        const inProgress = requestsWithCreator.filter(r => r.status === 'in_design').length;
        const awaitingApproval = requestsWithCreator.filter(r => r.status === 'design_submitted' || r.status === 'in_print').length;

        setStats({ 
          totalJobs, 
          completed, 
          inProgress, 
          awaitingApproval,
          totalCommissions,
          paidCommissions
        });
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

  const handleSubmitDesign = async (requestId: string) => {
    try {
      // Check if there are any files uploaded
      if (requestFiles.length === 0) {
        toast({
          title: 'No files uploaded',
          description: 'Please upload at least one design file before submitting.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('sales_order_requests')
        .update({ status: 'design_submitted' })
        .eq('id', requestId)
        .eq('designer_id', user?.id);

      if (error) throw error;

      toast({
        title: 'Design Submitted',
        description: 'Your design has been submitted to the accountant for review.',
      });

      setSelectedRequest(null);
      fetchDesignerData();
    } catch (error: any) {
      console.error('Error submitting design:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit design',
        variant: 'destructive',
      });
    }
  };

  const fetchRequestFiles = async (requestId: string) => {
    try {
      const { data, error } = await supabase
        .from('request_files')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequestFiles(data || []);
    } catch (error) {
      console.error('Error fetching request files:', error);
      setRequestFiles([]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedRequest) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedRequest.id}/${Date.now()}-${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('request-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Save file record to database
        const { error: dbError } = await supabase
          .from('request_files')
          .insert({
            request_id: selectedRequest.id,
            uploaded_by: user?.id,
            file_name: file.name,
            file_path: fileName,
            file_type: file.type,
          });

        if (dbError) throw dbError;
      }

      toast({
        title: 'Files uploaded',
        description: `${files.length} file(s) uploaded successfully.`,
      });

      fetchRequestFiles(selectedRequest.id);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      console.error('Error downloading file:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const openRequestDetails = async (request: SalesRequest) => {
    setSelectedRequest(request);
    await fetchRequestFiles(request.id);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Pending', variant: 'outline' },
      processed: { label: 'Processed', variant: 'secondary' },
      in_design: { label: 'In Design', variant: 'default' },
      design_submitted: { label: 'Submitted', variant: 'secondary' },
      in_print: { label: 'In Print', variant: 'default' },
      printed: { label: 'Printed', variant: 'secondary' },
      collected: { label: 'Collected', variant: 'secondary' },
    };

    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true;
    if (filter === 'in-progress') return request.status === 'in_design';
    if (filter === 'ready') return request.status === 'design_submitted' || request.status === 'in_print';
    if (filter === 'completed') return request.status === 'printed' || request.status === 'collected';
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
      <div className="space-y-4 sm:space-y-6 w-full max-w-full">
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src="" />
            <AvatarFallback>{profile?.full_name?.charAt(0) || 'D'}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{profile?.full_name}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Designer Dashboard</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Tabs for Jobs and Commissions */}
        <Tabs defaultValue="jobs" className="w-full">
          <TabsList>
            <TabsTrigger value="jobs">My Jobs</TabsTrigger>
            <TabsTrigger value="commissions">My Commissions</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="mt-4">
            {/* Jobs Table with Filters */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle>My Assigned Jobs</CardTitle>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
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
                          {dateFilter ? format(dateFilter, "PPP") : "All Dates"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDateFilter(null as any);
                            }}
                            className="w-full mb-2"
                          >
                            Clear Filter
                          </Button>
                        </div>
                        <Calendar
                          mode="single"
                          selected={dateFilter}
                          onSelect={(date) => {
                            if (date) {
                              setDateFilter(date);
                            }
                          }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Tabs value={filter} onValueChange={setFilter} className="w-full sm:w-auto">
                      <TabsList className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto">
                        <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
                        <TabsTrigger value="in-progress" className="text-xs sm:text-sm">In Progress</TabsTrigger>
                        <TabsTrigger value="ready" className="text-xs sm:text-sm">Ready</TabsTrigger>
                        <TabsTrigger value="completed" className="text-xs sm:text-sm">Completed</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto custom-scrollbar">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">Request ID</TableHead>
                  <TableHead className="min-w-[150px]">Customer</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="min-w-[120px]">Created</TableHead>
                  <TableHead className="min-w-[150px]">Created By</TableHead>
                  <TableHead className="min-w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No jobs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((request) => (
                    <TableRow 
                      key={request.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="font-mono text-sm">
                        #{request.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.customer_name}</div>
                          {request.company_name && (
                            <div className="text-sm text-muted-foreground">
                              {request.company_name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{request.description}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>
                        {format(new Date(request.created_at), 'PP')}
                      </TableCell>
                      <TableCell>{request.creator?.full_name || 'Unknown'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRequestDetails(request)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {request.status === 'in_design' ? 'Manage' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="commissions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>My Design Commissions</CardTitle>
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

        {/* Request Details Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Job Details</DialogTitle>
              <DialogDescription>
                View job information and upload design files
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-6">
                {/* Customer Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Customer Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedRequest.customer_name}</p>
                    </div>
                    {selectedRequest.company_name && (
                      <div>
                        <Label className="text-muted-foreground">Company</Label>
                        <p className="font-medium">{selectedRequest.company_name}</p>
                      </div>
                    )}
                    {selectedRequest.customer_phone && (
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        <p className="font-medium">{selectedRequest.customer_phone}</p>
                      </div>
                    )}
                    {selectedRequest.customer_email && (
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        <p className="font-medium">{selectedRequest.customer_email}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Job Details */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Job Details</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-muted-foreground">Description</Label>
                      <p className="font-medium whitespace-pre-wrap">{selectedRequest.description}</p>
                    </div>
                    {selectedRequest.notes && (
                      <div>
                        <Label className="text-muted-foreground">Notes</Label>
                        <p className="font-medium whitespace-pre-wrap">{selectedRequest.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-4">
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p className="font-medium">{format(new Date(selectedRequest.created_at), 'PPP')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Design Files */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Design Files</h3>
                    {selectedRequest.status === 'in_design' && (
                      <div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          multiple
                          className="hidden"
                          accept="image/*,.pdf,.ai,.psd,.eps,.svg"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploading ? 'Uploading...' : 'Upload Files'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {requestFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {requestFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{file.file_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(file.created_at), 'PPp')}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadFile(file.file_path, file.file_name)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                {selectedRequest.status === 'in_design' && (
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleSubmitDesign(selectedRequest.id)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Submit Design
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default DesignerDashboard;
