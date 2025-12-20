import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  User, 
  Phone, 
  Mail, 
  Building2, 
  ShoppingCart, 
  DollarSign, 
  Calendar,
  FileText,
  Palette,
  Printer,
  CreditCard,
  Download,
  CheckCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

interface Order {
  id: string;
  job_title: string;
  order_value: number;
  amount_paid: number;
  payment_status: string;
  payment_method: string | null;
  status: string;
  quantity: number;
  print_type: string | null;
  description: string | null;
  delivery_date: string | null;
  created_at: string;
  designer: { full_name: string } | null;
  salesperson: { full_name: string } | null;
  invoice_number: string | null;
  files: Array<{
    id: string;
    file_name: string;
    file_type: string | null;
    is_final_design: boolean;
    file_path: string;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference_number: string | null;
  }>;
}

interface SalesRequest {
  id: string;
  customer_name: string;
  company_name: string | null;
  description: string;
  notes: string | null;
  status: string;
  payment_status: string | null;
  created_at: string;
  processed_at: string | null;
  designer: { full_name: string } | null;
  print_operator: { full_name: string } | null;
  invoice: {
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    status: string;
  } | null;
  files: Array<{
    id: string;
    file_name: string;
    file_path: string;
    file_type: string | null;
    created_at: string;
  }>;
  printed_at: string | null;
}

const CustomerOrderHistory = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [salesRequests, setSalesRequests] = useState<SalesRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a phone number',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      // Find customer by phone
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phoneNumber.trim())
        .maybeSingle();

      if (customerError) throw customerError;

      if (!customerData) {
        // Try to find by customer name in sales_order_requests
        const { data: requestsByPhone, error: requestsError } = await supabase
          .from('sales_order_requests')
          .select('*')
          .eq('customer_phone', phoneNumber.trim())
          .order('created_at', { ascending: false });

        if (requestsError) throw requestsError;

        if (!requestsByPhone || requestsByPhone.length === 0) {
          setCustomer(null);
          setOrders([]);
          setSalesRequests([]);
          toast({
            title: 'Not Found',
            description: 'No customer found with this phone number',
          });
          return;
        }

        // Create a pseudo-customer from the first request
        const firstRequest = requestsByPhone[0];
        const pseudoCustomer: Customer = {
          id: '',
          name: firstRequest.customer_name,
          email: firstRequest.customer_email,
          phone: firstRequest.customer_phone,
          company_name: firstRequest.company_name,
          created_at: firstRequest.created_at,
        };
        setCustomer(pseudoCustomer);
        setOrders([]);

        // Enrich sales requests with files, designer, print operator, and invoice
        const enrichedRequests = await enrichSalesRequests(requestsByPhone);
        setSalesRequests(enrichedRequests);

        return;
      }

      setCustomer(customerData);

      // Fetch all orders for this customer
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerData.id)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Also fetch sales_order_requests by customer phone or name
      const { data: requestsData } = await supabase
        .from('sales_order_requests')
        .select('*')
        .or(`customer_phone.eq.${customerData.phone},customer_name.eq.${customerData.name}`)
        .order('created_at', { ascending: false });

      // Enrich orders with designer, salesperson, files, payments, and invoice
      const enrichedOrders = await Promise.all(
        (ordersData || []).map(async (order) => {
          let designer = null;
          let salesperson = null;
          let invoice_number = null;

          if (order.designer_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.designer_id)
              .maybeSingle();
            designer = data;
          }

          if (order.salesperson_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.salesperson_id)
              .maybeSingle();
            salesperson = data;
          }

          const { data: filesData } = await supabase
            .from('order_files')
            .select('*')
            .eq('order_id', order.id)
            .order('created_at', { ascending: false });

          const { data: paymentsData } = await supabase
            .from('payments')
            .select('*')
            .eq('order_id', order.id)
            .order('payment_date', { ascending: false });

          const { data: invoiceData } = await supabase
            .from('invoices')
            .select('invoice_number')
            .eq('order_id', order.id)
            .maybeSingle();

          if (invoiceData) {
            invoice_number = invoiceData.invoice_number;
          }

          return {
            ...order,
            designer,
            salesperson,
            invoice_number,
            files: filesData || [],
            payments: paymentsData || [],
          };
        })
      );

      setOrders(enrichedOrders);

      // Enrich sales requests
      const enrichedRequests = await enrichSalesRequests(requestsData || []);
      setSalesRequests(enrichedRequests);

      if (enrichedOrders.length === 0 && enrichedRequests.length === 0) {
        toast({
          title: 'No Orders',
          description: 'This customer has no orders yet',
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

  // Helper to enrich sales requests with related data
  const enrichSalesRequests = async (requests: any[]): Promise<SalesRequest[]> => {
    return Promise.all(
      requests.map(async (request) => {
        let designer = null;
        let print_operator = null;
        let invoice = null;
        let printed_at = null;

        if (request.designer_id) {
          const { data } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.designer_id)
            .maybeSingle();
          designer = data;
        }

        if (request.print_operator_id) {
          const { data } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.print_operator_id)
            .maybeSingle();
          print_operator = data;
        }

        if (request.linked_invoice_id) {
          const { data } = await supabase
            .from('invoices')
            .select('invoice_number, total_amount, amount_paid, status')
            .eq('id', request.linked_invoice_id)
            .maybeSingle();
          invoice = data;
        }

        const { data: filesData } = await supabase
          .from('request_files')
          .select('*')
          .eq('request_id', request.id)
          .order('created_at', { ascending: false });

        // If status is 'printed' or 'completed', use updated_at as printed_at
        if (request.status === 'printed' || request.status === 'completed') {
          printed_at = request.updated_at;
        }

        return {
          id: request.id,
          customer_name: request.customer_name,
          company_name: request.company_name,
          description: request.description,
          notes: request.notes,
          status: request.status,
          payment_status: request.payment_status,
          created_at: request.created_at,
          processed_at: request.processed_at,
          designer,
          print_operator,
          invoice,
          files: filesData || [],
          printed_at,
        };
      })
    );
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      processed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      in_design: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
      design_submitted: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      in_print: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      printed: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
      collected: 'bg-green-500/10 text-green-500 border-green-500/20',
      completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      designing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      ready_for_print: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      printing: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-500/10 text-green-500 border-green-500/20',
      partial: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      unpaid: 'bg-red-500/10 text-red-500 border-red-500/20',
      debt: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  const downloadRequestFile = async (filePath: string, fileName: string) => {
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

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('order-files')
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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer Order History</h1>
          <p className="text-muted-foreground">Track customer orders and complete work history</p>
        </div>

        {/* Search Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search by Phone Number
            </CardTitle>
            <CardDescription>
              Enter customer's phone number to view their complete order history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="text-lg"
                />
              </div>
              <Button type="submit" className="self-end" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Customer Profile */}
        {searched && customer && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{customer.name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{customer.phone || 'N/A'}</p>
                  </div>
                </div>
                {customer.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{customer.email}</p>
                    </div>
                  </div>
                )}
                {customer.company_name && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Company</p>
                      <p className="font-medium">{customer.company_name}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orders List */}
        {searched && customer && orders.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <ShoppingCart className="h-6 w-6" />
                Order History ({orders.length})
              </h2>
            </div>

            {orders.map((order) => (
              <Card key={order.id} className="overflow-hidden">
                <CardHeader className="bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{order.job_title}</CardTitle>
                      <CardDescription>
                        Created on {format(new Date(order.created_at), 'PPP')}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                      <Badge className={getPaymentStatusColor(order.payment_status)}>
                        {order.payment_status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {/* Order Details Grid */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {order.invoice_number && (
                        <div className="flex items-start gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Invoice Number</p>
                            <p className="font-semibold">{order.invoice_number}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">Order Value</p>
                          <p className="font-semibold text-lg">
                            ${order.order_value.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">Amount Paid</p>
                          <p className="font-semibold text-lg text-green-600">
                            ${order.amount_paid.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <ShoppingCart className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">Quantity</p>
                          <p className="font-medium">{order.quantity} units</p>
                        </div>
                      </div>
                      {order.delivery_date && (
                        <div className="flex items-start gap-3">
                          <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Delivery Date</p>
                            <p className="font-medium">
                              {format(new Date(order.delivery_date), 'PP')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {order.description && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Description</p>
                        <p className="text-sm">{order.description}</p>
                      </div>
                    )}

                    <Separator />

                    {/* Team Members */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {order.salesperson && (
                        <div className="flex items-start gap-3">
                          <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Salesperson</p>
                            <p className="font-medium">{order.salesperson.full_name}</p>
                          </div>
                        </div>
                      )}
                      {order.designer && (
                        <div className="flex items-start gap-3">
                          <Palette className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Designer</p>
                            <p className="font-medium">{order.designer.full_name}</p>
                          </div>
                        </div>
                      )}
                      {order.print_type && (
                        <div className="flex items-start gap-3">
                          <Printer className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Print Type</p>
                            <p className="font-medium">{order.print_type}</p>
                          </div>
                        </div>
                      )}
                      {order.payment_method && (
                        <div className="flex items-start gap-3">
                          <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Payment Method</p>
                            <p className="font-medium">
                              {order.payment_method.replace(/_/g, ' ')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Files Section */}
                    {order.files.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Files ({order.files.length})
                          </h4>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {order.files.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate text-sm">
                                    {file.file_name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(file.created_at), 'PP')}
                                    </p>
                                    {file.is_final_design && (
                                      <Badge variant="outline" className="text-xs">
                                        Final
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => downloadFile(file.file_path, file.file_name)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Payments Section */}
                    {order.payments.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Payment History ({order.payments.length})
                          </h4>
                          <div className="space-y-2">
                            {order.payments.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                              >
                                <div className="flex items-center gap-4 flex-1">
                                  <div>
                                    <p className="font-semibold text-green-600">
                                      ${payment.amount.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(payment.payment_date), 'PPP')}
                                    </p>
                                  </div>
                                  <Badge variant="outline">
                                    {payment.payment_method.replace(/_/g, ' ')}
                                  </Badge>
                                </div>
                                {payment.reference_number && (
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground mb-0.5">Receipt #</p>
                                    <p className="text-sm font-medium">
                                      {payment.reference_number}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sales Requests / Jobs List */}
        {searched && customer && salesRequests.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <Sparkles className="h-6 w-6" />
                Design & Print Jobs ({salesRequests.length})
              </h2>
            </div>

            {salesRequests.map((request) => (
              <Card key={request.id} className="overflow-hidden border-primary/10">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{request.description}</CardTitle>
                      <CardDescription>
                        Created on {format(new Date(request.created_at), 'PPP')}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(request.status)}>
                        {request.status.replace(/_/g, ' ')}
                      </Badge>
                      {request.payment_status && (
                        <Badge className={getPaymentStatusColor(request.payment_status)}>
                          {request.payment_status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {/* Invoice Section */}
                    {request.invoice && (
                      <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="h-5 w-5 text-blue-500" />
                          <h4 className="font-semibold">Invoice Details</h4>
                        </div>
                        <div className="grid gap-3 md:grid-cols-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Invoice Number</p>
                            <p className="font-semibold text-lg">{request.invoice.invoice_number}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Amount</p>
                            <p className="font-semibold text-lg">${request.invoice.total_amount.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Amount Paid</p>
                            <p className="font-semibold text-lg text-green-600">${request.invoice.amount_paid.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Balance</p>
                            <p className={`font-semibold text-lg ${(request.invoice.total_amount - request.invoice.amount_paid) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                              ${(request.invoice.total_amount - request.invoice.amount_paid).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {request.notes && (
                      <div className="rounded-xl border bg-amber-500/5 border-amber-500/20 p-4">
                        <div className="flex items-center gap-2 text-amber-600 mb-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-xs font-medium uppercase tracking-wider">Order Notes</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
                      </div>
                    )}

                    {/* Team & Dates Grid */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {request.designer && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                          <Palette className="h-5 w-5 text-violet-500 mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Designer</p>
                            <p className="font-medium">{request.designer.full_name}</p>
                          </div>
                        </div>
                      )}
                      {request.print_operator && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-teal-500/5 border border-teal-500/20">
                          <Printer className="h-5 w-5 text-teal-500 mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Print Operator</p>
                            <p className="font-medium">{request.print_operator.full_name}</p>
                          </div>
                        </div>
                      )}
                      {request.printed_at && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Printed Date</p>
                            <p className="font-medium">{format(new Date(request.printed_at), 'PPP')}</p>
                          </div>
                        </div>
                      )}
                      {request.processed_at && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <Clock className="h-5 w-5 text-blue-500 mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Processed Date</p>
                            <p className="font-medium">{format(new Date(request.processed_at), 'PPP')}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Design Files Section */}
                    {request.files.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Design Files ({request.files.length})
                          </h4>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {request.files.map((file) => (
                              <div
                                key={file.id}
                                className="group flex items-center justify-between p-3 border rounded-xl bg-card/50 transition-all hover:bg-card hover:shadow-sm"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <FileText className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium truncate text-sm">{file.file_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {format(new Date(file.created_at), 'PP')}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => downloadRequestFile(file.file_path, file.file_name)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No Results Message */}
        {searched && !customer && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No customer found</p>
              <p className="text-sm text-muted-foreground">
                Try searching with a different phone number
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default CustomerOrderHistory;
