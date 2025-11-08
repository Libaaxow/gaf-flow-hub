import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Download, MessageSquare, FileText, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';

interface Order {
  id: string;
  job_title: string;
  description: string;
  order_value: number;
  status: string;
  payment_status: string;
  amount_paid: number;
  delivery_date: string | null;
  notes: string | null;
  print_type: string | null;
  quantity: number;
  customers: { id: string; name: string; email: string | null; phone: string | null; company_name: string | null } | null;
  salesperson: { id: string; full_name: string } | null;
  designer: { id: string; full_name: string } | null;
}

interface OrderFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  is_final_design: boolean;
  created_at: string;
  uploaded_by: string;
  profiles: { full_name: string } | null;
}

interface Comment {
  id: string;
  comment: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isFinalDesign, setIsFinalDesign] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
      fetchDesigners();
      fetchUserRole();
    }
  }, [id, user]);

  const fetchUserRole = async () => {
    if (!user?.id) return;
    
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    setUserRole(data?.role || null);
  };

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          customers (id, name, email, phone, company_name)
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fetch salesperson and designer separately
      let salesperson = null;
      let designer = null;
      
      if (orderData.salesperson_id) {
        const { data: salesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', orderData.salesperson_id)
          .single();
        salesperson = salesData;
      }

      if (orderData.designer_id) {
        const { data: designerData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', orderData.designer_id)
          .single();
        designer = designerData;
      }

      setOrder({ ...orderData, salesperson, designer } as Order);

      const { data: filesData } = await supabase
        .from('order_files')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: false });

      // Fetch uploader profiles separately
      const filesWithProfiles = await Promise.all(
        (filesData || []).map(async (file) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', file.uploaded_by)
            .single();
          return { ...file, profiles: profile };
        })
      );

      setFiles(filesWithProfiles as OrderFile[]);

      const { data: commentsData } = await supabase
        .from('order_comments')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true });

      // Fetch commenter profiles separately
      const commentsWithProfiles = await Promise.all(
        (commentsData || []).map(async (comment) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', comment.user_id)
            .single();
          return { ...comment, profiles: profile };
        })
      );

      setComments(commentsWithProfiles as Comment[]);
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

  const fetchDesigners = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, profiles:user_id (id, full_name)')
      .eq('role', 'designer');
    
    setDesigners(data?.map(d => d.profiles).filter(Boolean) || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('order-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('order_files')
        .insert([{
          order_id: id,
          file_name: file.name,
          file_path: fileName,
          file_type: file.type,
          uploaded_by: user?.id,
          is_final_design: isFinalDesign,
        }]);

      if (dbError) throw dbError;

      toast({
        title: 'Success',
        description: `${isFinalDesign ? 'Final design' : 'File'} uploaded successfully`,
      });

      setIsFinalDesign(false);
      fetchOrderDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('order-files')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateOrder = async (field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ [field]: value })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order updated successfully',
      });

      fetchOrderDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !id) return;

    try {
      const { error } = await supabase
        .from('order_comments')
        .insert([{
          order_id: id,
          user_id: user?.id,
          comment: newComment,
        }]);

      if (error) throw error;

      setNewComment('');
      fetchOrderDetails();

      toast({
        title: 'Success',
        description: 'Comment added',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleMarkReadyForPrint = async () => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'designed' })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Job marked as ready for print',
      });

      fetchOrderDetails();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-warning',
      designing: 'bg-info',
      designed: 'bg-info',
      approved: 'bg-success',
      printing: 'bg-primary',
      printed: 'bg-success',
      on_hold: 'bg-destructive',
      delivered: 'bg-success',
    };
    return colors[status] || 'bg-secondary';
  };

  const getPaymentColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'bg-destructive',
      partial: 'bg-warning',
      paid: 'bg-success',
    };
    return colors[status] || 'bg-secondary';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading order...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Order not found</p>
          <Button onClick={() => navigate('/orders')} className="mt-4">
            Back to Orders
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{order.job_title}</h1>
              <p className="text-muted-foreground">Order Details</p>
            </div>
          </div>
          
          {userRole === 'designer' && order.designer?.id === user?.id && order.status === 'designing' && (
            <Button onClick={handleMarkReadyForPrint} className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Mark Ready for Print
            </Button>
          )}
          
          {userRole === 'print_operator' && ['designed', 'printing', 'printed'].includes(order.status) && (
            <div className="flex gap-2">
              {order.status === 'designed' && (
                <>
                  <Button onClick={() => handleUpdateOrder('status', 'printing')} className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Start Printing
                  </Button>
                  <Button variant="outline" onClick={() => handleUpdateOrder('status', 'on_hold')}>
                    Put On Hold
                  </Button>
                </>
              )}
              {order.status === 'printing' && (
                <>
                  <Button onClick={() => handleUpdateOrder('status', 'printed')} className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Mark as Printed
                  </Button>
                  <Button variant="outline" onClick={() => handleUpdateOrder('status', 'on_hold')}>
                    Put On Hold
                  </Button>
                </>
              )}
              {order.status === 'printed' && (
                <Button onClick={() => handleUpdateOrder('status', 'delivered')} className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Mark as Delivered
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Customer Name</Label>
                <Input value={order.customers?.name || 'N/A'} disabled />
              </div>

              {order.customers?.company_name && (
                <div className="grid gap-2">
                  <Label>Company</Label>
                  <Input value={order.customers.company_name} disabled />
                </div>
              )}

              {order.customers?.email && (
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input value={order.customers.email} disabled />
                </div>
              )}

              {order.customers?.phone && (
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input value={order.customers.phone} disabled />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Job Title</Label>
                <Input value={order.job_title} disabled />
              </div>

              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea 
                  value={order.description || ''} 
                  onChange={(e) => handleUpdateOrder('description', e.target.value)}
                  onBlur={(e) => handleUpdateOrder('description', e.target.value)}
                  rows={3}
                />
              </div>

              {order.print_type && (
                <div className="grid gap-2">
                  <Label>Print Type</Label>
                  <Input value={order.print_type} disabled />
                </div>
              )}

              <div className="grid gap-2">
                <Label>Quantity</Label>
                <Input type="number" value={order.quantity} disabled />
              </div>

              <div className="grid gap-2">
                <Label>Delivery Date</Label>
                <Input 
                  type="date"
                  value={order.delivery_date || ''} 
                  onChange={(e) => handleUpdateOrder('delivery_date', e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label>Order Notes</Label>
                <Textarea 
                  value={order.notes || ''} 
                  onChange={(e) => handleUpdateOrder('notes', e.target.value)}
                  onBlur={(e) => handleUpdateOrder('notes', e.target.value)}
                  rows={3}
                  placeholder="Special instructions or notes..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Order Value</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={order.order_value} 
                  onChange={(e) => handleUpdateOrder('order_value', parseFloat(e.target.value))}
                  onBlur={(e) => handleUpdateOrder('order_value', parseFloat(e.target.value))}
                />
              </div>

              <div className="grid gap-2">
                <Label>Payment Status</Label>
                <Select 
                  value={order.payment_status} 
                  onValueChange={(value) => handleUpdateOrder('payment_status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Amount Paid</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={order.amount_paid} 
                  onChange={(e) => handleUpdateOrder('amount_paid', parseFloat(e.target.value))}
                  onBlur={(e) => handleUpdateOrder('amount_paid', parseFloat(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Order Status</Label>
                <Select 
                  value={order.status} 
                  onValueChange={(value) => handleUpdateOrder('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="designing">Designing</SelectItem>
                    <SelectItem value="designed">Designed</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="printing">Printing</SelectItem>
                    <SelectItem value="printed">Printed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Assigned Designer</Label>
                <Select 
                  value={order.designer?.id || ''} 
                  onValueChange={(value) => handleUpdateOrder('designer_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select designer" />
                  </SelectTrigger>
                  <SelectContent>
                    {designers.map((designer) => (
                      <SelectItem key={designer.id} value={designer.id}>
                        {designer.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Salesperson</Label>
                <Input value={order.salesperson?.full_name || 'N/A'} disabled />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Files & Attachments
                </CardTitle>
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <Button type="button" disabled={uploading} asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Upload File'}
                    </span>
                  </Button>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.ai,.png,.jpg,.jpeg,.psd,.eps,.svg"
                  />
                </Label>
              </div>
              
              {userRole === 'designer' && order.designer?.id === user?.id && (
                <div className="flex items-center space-x-2 bg-muted p-3 rounded-lg">
                  <Checkbox
                    id="final-design"
                    checked={isFinalDesign}
                    onCheckedChange={(checked) => setIsFinalDesign(checked as boolean)}
                  />
                  <label
                    htmlFor="final-design"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Mark next upload as final design
                  </label>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{file.file_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Uploaded by {file.profiles?.full_name || 'Unknown'} on{' '}
                      {new Date(file.created_at).toLocaleDateString()}
                    </p>
                    {file.is_final_design && (
                      <Badge className="mt-1 bg-success">Final Design</Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadFile(file.file_path, file.file_name)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {files.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No files uploaded yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">
                      {comment.profiles?.full_name || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{comment.comment}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No comments yet</p>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <Button onClick={handleAddComment}>Send</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default OrderDetail;
