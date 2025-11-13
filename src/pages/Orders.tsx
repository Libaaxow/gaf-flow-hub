import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { z } from 'zod';

interface Order {
  id: string;
  job_title: string;
  order_value: number;
  status: string;
  payment_status: string;
  delivery_date: string | null;
  customers: { name: string } | null;
}

const orderSchema = z.object({
  job_title: z.string().min(3, 'Job title must be at least 3 characters'),
  description: z.string().optional(),
  order_value: z.number().min(0, 'Order value must be positive'),
});

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(9, 'Phone must be at least 9 digits'),
  company_name: z.string().optional().transform(val => !val || val.trim() === '' ? null : val),
});

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneCheckOpen, setPhoneCheckOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<any>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchOrders();
    fetchCustomers();

    // Set up realtime subscription for orders
    const ordersChannel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    // Set up realtime subscription for customers
    const customersChannel = supabase
      .channel('customers-changes')
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
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(customersChannel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
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

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    setCustomers(data || []);
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

      setExistingCustomer(data);
      setPhoneCheckOpen(false);
      setOrderFormOpen(true);

      if (data) {
        toast({
          title: 'Customer Found',
          description: `Proceeding with existing customer: ${data.name}`,
        });
      } else {
        toast({
          title: 'New Customer',
          description: 'Please provide customer details',
        });
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

  const handleAddOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    try {
      let customerId = existingCustomer?.id;

      // Create new customer if doesn't exist
      if (!existingCustomer) {
        const customerData = {
          name: formData.get('customer_name') as string,
          phone: phoneNumber,
          company_name: (formData.get('company_name') as string) || '',
          created_by: user?.id,
        };

        const validatedCustomer = customerSchema.parse(customerData);

        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert([{
            name: validatedCustomer.name,
            phone: validatedCustomer.phone,
            company_name: validatedCustomer.company_name || null,
            created_by: user?.id,
          }])
          .select()
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      // Create order
      const orderData = {
        customer_id: customerId,
        job_title: formData.get('job_title') as string,
        description: formData.get('description') as string,
        order_value: parseFloat(formData.get('order_value') as string),
        salesperson_id: user?.id,
        delivery_date: formData.get('delivery_date') as string || null,
      };

      orderSchema.parse(orderData);

      const { error: orderError } = await supabase
        .from('orders')
        .insert([orderData]);

      if (orderError) throw orderError;

      toast({
        title: 'Success',
        description: 'Order created successfully',
      });

      form.reset();
      setOrderFormOpen(false);
      setPhoneNumber('');
      setExistingCustomer(null);
      fetchOrders();
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
      pending_accounting_review: 'bg-warning',
      designing: 'bg-info',
      awaiting_accounting_approval: 'bg-info',
      ready_for_print: 'bg-success',
      printing: 'bg-primary',
      printed: 'bg-success',
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
            <p className="mt-4 text-muted-foreground">Loading orders...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground">Track and manage all orders</p>
          </div>
          
          {/* Phone Check Dialog */}
          <Dialog open={phoneCheckOpen} onOpenChange={(open) => {
            setPhoneCheckOpen(open);
            if (!open) {
              setPhoneNumber('');
              setExistingCustomer(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enter Customer Phone Number</DialogTitle>
              </DialogHeader>
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
                  {checkingPhone ? 'Checking...' : 'Continue'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Order Form Dialog */}
          <Dialog open={orderFormOpen} onOpenChange={(open) => {
            setOrderFormOpen(open);
            if (!open) {
              setPhoneNumber('');
              setExistingCustomer(null);
            }
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOrder} className="space-y-4">
                {/* Customer Information */}
                <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
                  <h3 className="font-semibold">Customer Information</h3>
                  
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={phoneNumber} disabled />
                  </div>

                  {existingCustomer ? (
                    <div className="space-y-2 rounded-lg border p-3 bg-background">
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
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="customer_name">Customer Name *</Label>
                        <Input id="customer_name" name="customer_name" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company_name">Company Name</Label>
                        <Input id="company_name" name="company_name" />
                      </div>
                    </>
                  )}
                </div>

                {/* Order Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Order Details</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="job_title">Job Title *</Label>
                    <Input id="job_title" name="job_title" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order_value">Order Value *</Label>
                    <Input id="order_value" name="order_value" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery_date">Delivery Date</Label>
                    <Input id="delivery_date" name="delivery_date" type="date" />
                  </div>
                </div>

                <Button type="submit" className="w-full">Create Order</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {orders.map((order) => (
            <Card key={order.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => window.location.href = `/orders/${order.id}`}>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-lg">{order.job_title}</CardTitle>
                  <div className="flex gap-2">
                    <Badge className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                    <Badge className={getPaymentColor(order.payment_status)}>
                      {order.payment_status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{order.customers?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Value:</span>
                    <span className="font-medium">${order.order_value}</span>
                  </div>
                  {order.delivery_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery:</span>
                      <span className="font-medium">
                        {new Date(order.delivery_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No orders found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Orders;
