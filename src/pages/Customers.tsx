import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Search, ChevronDown, ChevronUp, FileText, Package, Pencil, Trash2, DollarSign, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

interface CustomerBalance {
  customerId: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
}

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  status: string;
  is_draft: boolean;
}

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(9, 'Phone must be at least 9 digits'),
  company_name: z.string().optional().transform(val => !val || val.trim() === '' ? null : val),
});

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerBalances, setCustomerBalances] = useState<Map<string, CustomerBalance>>(new Map());
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [selectedCustomerForBalance, setSelectedCustomerForBalance] = useState<Customer | null>(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [loadingUnpaidInvoices, setLoadingUnpaidInvoices] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchCustomers();
    checkAdminRole();

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

  const checkAdminRole = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    
    setIsAdmin(!!data);
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
      
      // Fetch all invoices to calculate balances
      await fetchCustomerBalances(data || []);
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

  const fetchCustomerBalances = async (customerList: Customer[]) => {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('customer_id, total_amount, amount_paid, is_draft')
        .eq('is_draft', false);

      if (error) throw error;

      const balancesMap = new Map<string, CustomerBalance>();

      // Initialize all customers with zero balances
      customerList.forEach(customer => {
        balancesMap.set(customer.id, {
          customerId: customer.id,
          totalBilled: 0,
          totalPaid: 0,
          outstanding: 0,
        });
      });

      // Calculate balances from invoices
      invoices?.forEach(invoice => {
        const existing = balancesMap.get(invoice.customer_id);
        if (existing) {
          existing.totalBilled += invoice.total_amount || 0;
          existing.totalPaid += invoice.amount_paid || 0;
          existing.outstanding = existing.totalBilled - existing.totalPaid;
        }
      });

      setCustomerBalances(balancesMap);
    } catch (error: any) {
      console.error('Error fetching customer balances:', error);
    }
  };

  const fetchUnpaidInvoices = async (customerId: string) => {
    setLoadingUnpaidInvoices(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, amount_paid, status, is_draft')
        .eq('customer_id', customerId)
        .eq('is_draft', false)
        .order('invoice_date', { ascending: true });

      if (error) throw error;

      const unpaid = (data || [])
        .map(inv => ({
          ...inv,
          outstanding: (inv.total_amount || 0) - (inv.amount_paid || 0),
        }))
        .filter(inv => inv.outstanding > 0);

      setUnpaidInvoices(unpaid);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingUnpaidInvoices(false);
    }
  };

  const handleBalanceClick = async (customer: Customer) => {
    setSelectedCustomerForBalance(customer);
    setBalanceDialogOpen(true);
    await fetchUnpaidInvoices(customer.id);
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

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setPhoneNumber(customer.phone || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCustomer) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const customerData = {
      name: formData.get('name') as string,
      phone: phoneNumber,
      company_name: (formData.get('company_name') as string) || '',
    };

    try {
      const validatedData = customerSchema.parse(customerData);

      const { error } = await supabase
        .from('customers')
        .update({ 
          name: validatedData.name,
          phone: validatedData.phone,
          company_name: validatedData.company_name || null,
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer updated successfully',
      });

      setIsEditDialogOpen(false);
      setEditingCustomer(null);
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

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerId) return;

    try {
      // First get all invoices for this customer
      const { data: customerInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('customer_id', deleteCustomerId);

      if (customerInvoices && customerInvoices.length > 0) {
        const invoiceIds = customerInvoices.map(inv => inv.id);

        // Unlink sales_order_requests from invoices
        await supabase
          .from('sales_order_requests')
          .update({ linked_invoice_id: null })
          .in('linked_invoice_id', invoiceIds);

        // Delete invoice items first
        for (const invoiceId of invoiceIds) {
          await supabase
            .from('invoice_items')
            .delete()
            .eq('invoice_id', invoiceId);
        }

        // Delete payments linked to invoices
        await supabase
          .from('payments')
          .delete()
          .in('invoice_id', invoiceIds);

        // Delete invoices
        await supabase
          .from('invoices')
          .delete()
          .eq('customer_id', deleteCustomerId);
      }

      // Delete orders for this customer
      const { data: customerOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_id', deleteCustomerId);

      if (customerOrders && customerOrders.length > 0) {
        const orderIds = customerOrders.map(ord => ord.id);

        // Delete order files
        for (const orderId of orderIds) {
          await supabase.from('order_files').delete().eq('order_id', orderId);
          await supabase.from('order_comments').delete().eq('order_id', orderId);
          await supabase.from('order_history').delete().eq('order_id', orderId);
          await supabase.from('notifications').delete().eq('order_id', orderId);
          await supabase.from('commissions').delete().eq('order_id', orderId);
          await supabase.from('payments').delete().eq('order_id', orderId);
        }

        await supabase.from('orders').delete().eq('customer_id', deleteCustomerId);
      }

      // Delete quotations
      const { data: customerQuotations } = await supabase
        .from('quotations')
        .select('id')
        .eq('customer_id', deleteCustomerId);

      if (customerQuotations && customerQuotations.length > 0) {
        for (const quotation of customerQuotations) {
          await supabase.from('quotation_items').delete().eq('quotation_id', quotation.id);
        }
        await supabase.from('quotations').delete().eq('customer_id', deleteCustomerId);
      }

      // Finally delete the customer
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', deleteCustomerId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer and all related data deleted successfully',
      });

      setIsDeleteDialogOpen(false);
      setDeleteCustomerId(null);
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
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
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Phone</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Company</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <>
                      <tr key={customer.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td 
                          className="px-6 py-4 font-medium text-primary hover:underline cursor-pointer"
                          onClick={() => navigate(`/customers/${customer.id}/analytics`)}
                        >
                          {customer.name}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{customer.phone || '-'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{customer.company_name || '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2 items-center">
                            {/* Customer Balance Display */}
                            {(() => {
                              const balance = customerBalances.get(customer.id);
                              const outstanding = balance?.outstanding || 0;
                              return (
                                <Button
                                  variant={outstanding > 0 ? "destructive" : "outline"}
                                  size="sm"
                                  onClick={() => handleBalanceClick(customer)}
                                  className="gap-2 min-w-[120px]"
                                >
                                  <DollarSign className="h-4 w-4" />
                                  ${outstanding.toFixed(2)}
                                </Button>
                              );
                            })()}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/customer-reports?customer=${customer.id}`)}
                              className="gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              Report
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditCustomer(customer)}
                                  className="gap-2"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setDeleteCustomerId(customer.id);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  className="gap-2"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </Button>
                              </>
                            )}
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

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateCustomer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone *</Label>
              <Input 
                id="edit_phone" 
                name="phone" 
                type="tel" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_name">Name *</Label>
              <Input 
                id="edit_name" 
                name="name" 
                defaultValue={editingCustomer?.name}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_company_name">Company Name</Label>
              <Input 
                id="edit_company_name" 
                name="company_name"
                defaultValue={editingCustomer?.company_name || ''}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1">Update Customer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this customer? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCustomer}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Balance / Unpaid Invoices Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {selectedCustomerForBalance?.name} - Outstanding Balance
            </DialogTitle>
          </DialogHeader>
          
          {loadingUnpaidInvoices ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              {selectedCustomerForBalance && (
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Total Billed</p>
                    <p className="text-xl font-bold">
                      ${customerBalances.get(selectedCustomerForBalance.id)?.totalBilled.toFixed(2) || '0.00'}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-xl font-bold text-green-600">
                      ${customerBalances.get(selectedCustomerForBalance.id)?.totalPaid.toFixed(2) || '0.00'}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Outstanding</p>
                    <p className="text-xl font-bold text-destructive">
                      ${customerBalances.get(selectedCustomerForBalance.id)?.outstanding.toFixed(2) || '0.00'}
                    </p>
                  </Card>
                </div>
              )}

              {/* Unpaid Invoices List */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Invoices to Pay ({unpaidInvoices.length})
                </h4>
                
                {unpaidInvoices.length > 0 ? (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {unpaidInvoices.map((invoice) => (
                        <div 
                          key={invoice.id}
                          className="p-4 bg-muted/30 rounded-lg border cursor-pointer hover:border-primary transition-colors"
                          onClick={async () => {
                            // Fetch full invoice data
                            const { data } = await supabase
                              .from('invoices')
                              .select(`*, invoice_items(*)`)
                              .eq('id', invoice.id)
                              .maybeSingle();
                            if (data) {
                              setSelectedInvoice(data);
                              setInvoiceDialogOpen(true);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{invoice.invoice_number}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(invoice.invoice_date), 'MMM d, yyyy')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Outstanding</p>
                              <p className="font-bold text-destructive">${invoice.outstanding.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
                            <span>Total: ${invoice.total_amount.toFixed(2)}</span>
                            <span>Paid: ${invoice.amount_paid.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No outstanding invoices</p>
                    <p className="text-sm">This customer has paid all invoices</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Customers;
