import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

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
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().min(9, 'Phone must be at least 9 digits').optional().or(z.literal('')),
  company_name: z.string().optional(),
});

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [phoneCheckOpen, setPhoneCheckOpen] = useState(false);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchCustomers();
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
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      company_name: (formData.get('company_name') as string) || null,
      created_by: user?.id || null,
    };

    try {
      customerSchema.parse(customerData);

      const { error } = await supabase
        .from('customers')
        .insert([{ ...customerData, phone: phoneNumber }]);

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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <Card key={customer.id}>
              <CardHeader>
                <CardTitle className="text-lg">{customer.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {customer.company_name && (
                  <p className="text-sm font-medium text-muted-foreground">
                    {customer.company_name}
                  </p>
                )}
                {customer.email && (
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                )}
                {customer.phone && (
                  <p className="text-sm text-muted-foreground">{customer.phone}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No customers found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Customers;
