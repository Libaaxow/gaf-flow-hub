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
  Download
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

const CustomerOrderHistory = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
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
        setCustomer(null);
        setOrders([]);
        toast({
          title: 'Not Found',
          description: 'No customer found with this phone number',
        });
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

      if (enrichedOrders.length === 0) {
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      designing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      ready_for_print: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      printing: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      completed: 'bg-green-500/10 text-green-500 border-green-500/20',
      delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-500/10 text-green-500 border-green-500/20',
      partial: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      unpaid: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return colors[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
