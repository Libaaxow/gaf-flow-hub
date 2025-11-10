import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Search, ChevronDown, ChevronUp, FileText, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(9, 'Phone must be at least 9 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('').transform(() => null)),
  company_name: z.string().optional().or(z.literal('').transform(() => null)),
});

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [phoneCheckOpen, setPhoneCheckOpen] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchCustomers();

    // Set up realtime subscription for customers
    const channel = supabase
      .channel('customers-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
        },
        () => {
          fetchCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
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

  const handlePhoneCheck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCheckingPhone(true);
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingCustomer(data);
        toast({
          title: 'Customer Found',
          description: 'This phone number is already registered.',
        });
      } else {
        setExistingCustomer(null);
        setPhoneCheckOpen(false);
        setIsDialogOpen(true);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCheckingPhone(false);
    }
  };

  const resetAndClose = () => {
    setPhoneCheckOpen(false);
    setExistingCustomer(null);
    setPhoneNumber('');
  };

  const handleAddCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const customerData = {
      name: formData.get('name') as string,
      phone: phoneNumber,
      email: (formData.get('email') as string) || '',
      company_name: (formData.get('company_name') as string) || '',
      created_by: user?.id || null,
    };

    try {
      const validatedData = customerSchema.parse(customerData);

      const { error } = await supabase
        .from('customers')
        .insert([{ 
          name: validatedData.name,
          phone: validatedData.phone,
          email: validatedData.email || null,
          company_name: validatedData.company_name || null,
          created_by: user?.id || null,
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer added successfully',
      });

      form.reset();
      setIsDialogOpen(false);
      setPhoneNumber('');
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const fetchCustomerDetails = async (customerId: string) => {
    console.log('Fetching details for customer:', customerId);
    setLoadingDetails(true);
    try {
      // Fetch orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      console.log('Orders data:', orders);
      if (ordersError) {
        console.error('Orders error:', ordersError);
        throw ordersError;
      }

      // Fetch invoices
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_items(
            id,
            description,
            quantity,
            unit_price,
            amount
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      console.log('Invoices data:', invoices);
      if (invoicesError) {
        console.error('Invoices error:', invoicesError);
        throw invoicesError;
      }

      setCustomerOrders(orders || []);
      setCustomerInvoices(invoices || []);
    } catch (error: any) {
      console.error('Error fetching customer details:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const toggleCustomerDetails = async (customerId: string) => {
    console.log('Toggle customer details:', customerId);
    console.log('Current expanded customer:', expandedCustomer);
    
    if (expandedCustomer === customerId) {
      console.log('Collapsing customer');
      setExpandedCustomer(null);
      setCustomerOrders([]);
      setCustomerInvoices([]);
    } else {
      console.log('Expanding customer');
      setExpandedCustomer(customerId);
      await fetchCustomerDetails(customerId);
    }
  };

  const handleViewInvoice = (invoice: any) => {
    console.log('View invoice:', invoice);
    setSelectedInvoice(invoice);
    setInvoiceDialogOpen(true);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading customers...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground">Manage your customer database</p>
          </div>
          
          <Dialog open={phoneCheckOpen} onOpenChange={setPhoneCheckOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setPhoneNumber(''); setExistingCustomer(null); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {existingCustomer ? 'Customer Profile' : 'Check Phone Number'}
                </DialogTitle>
              </DialogHeader>
              
              {existingCustomer ? (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{existingCustomer.name}</p>
                    </div>
                    {existingCustomer.company_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="font-medium">{existingCustomer.company_name}</p>
                      </div>
                    )}
                    {existingCustomer.email && (
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{existingCustomer.email}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{existingCustomer.phone}</p>
                    </div>
                  </div>
                  <Button onClick={resetAndClose} className="w-full">Close</Button>
                </div>
              ) : (
                <form onSubmit={handlePhoneCheck} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone_check">Phone Number *</Label>
                    <Input 
                      id="phone_check" 
                      type="tel" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Enter phone number"
                      required 
                    />
                    <p className="text-sm text-muted-foreground">
                      We'll check if this customer already exists
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={checkingPhone}>
                    {checkingPhone ? 'Checking...' : 'Check'}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" value={phoneNumber} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input id="company_name" name="company_name" />
                </div>
                <Button type="submit" className="w-full">Add Customer</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Email</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Phone</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Company</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <>
                      <tr key={customer.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-medium">{customer.name}</td>
                        <td className="px-6 py-4 text-muted-foreground">{customer.email || '-'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{customer.phone || '-'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{customer.company_name || '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCustomerDetails(customer.id)}
                              className="gap-2"
                            >
                              <Package className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/customer-reports?customer=${customer.id}`)}
                              className="gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              Report
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedCustomer === customer.id && (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 bg-muted/20">
                            {loadingDetails ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Orders Section */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                    <h4 className="font-semibold">Orders ({customerOrders.length})</h4>
                                  </div>
                                  {customerOrders.length > 0 ? (
                                    <div className="space-y-2">
                                      {customerOrders.slice(0, 5).map((order) => (
                                        <div key={order.id} className="p-3 bg-background rounded-lg border">
                                          <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-sm">{order.job_title}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {order.status}
                                            </Badge>
                                          </div>
                                          <span className="text-sm text-muted-foreground">
                                            ${order.order_value?.toFixed(2)}
                                          </span>
                                        </div>
                                      ))}
                                      {customerOrders.length > 5 && (
                                        <p className="text-sm text-muted-foreground">
                                          +{customerOrders.length - 5} more orders
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No orders yet</p>
                                  )}
                                </div>

                                {/* Invoices Section */}
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <h4 className="font-semibold">Invoices ({customerInvoices.length})</h4>
                                  </div>
                                  {customerInvoices.length > 0 ? (
                                    <div className="space-y-2">
                                      {customerInvoices.slice(0, 5).map((invoice) => (
                                        <div 
                                          key={invoice.id} 
                                          className="p-3 bg-background rounded-lg border cursor-pointer hover:border-primary transition-colors"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewInvoice(invoice);
                                          }}
                                        >
                                          <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-sm">{invoice.invoice_number}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {invoice.status}
                                            </Badge>
                                          </div>
                                          <div className="flex justify-between text-sm text-muted-foreground">
                                            <span>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</span>
                                            <span className="font-medium">${invoice.total_amount?.toFixed(2)}</span>
                                          </div>
                                        </div>
                                      ))}
                                      {customerInvoices.length > 5 && (
                                        <p className="text-sm text-muted-foreground">
                                          +{customerInvoices.length - 5} more invoices
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No invoices yet</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        No customers found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Dialog */}
      {selectedInvoice && (
        <InvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          order={selectedInvoice}
        />
      )}
    </Layout>
  );
};

export default Customers;
