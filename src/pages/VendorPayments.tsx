import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Eye, CreditCard, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface VendorPayment {
  id: string;
  payment_number: string;
  vendor_id: string;
  vendor?: { name: string };
  vendor_bill_id: string | null;
  vendor_bill?: { bill_number: string; total_amount: number } | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
}

interface VendorBill {
  id: string;
  bill_number: string;
  vendor_id: string;
  total_amount: number;
  amount_paid: number;
  status: string;
}

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'evc', label: 'EVC Plus' },
  { value: 'zaad', label: 'Zaad' },
  { value: 'sahal', label: 'Sahal' },
  { value: 'other', label: 'Other' },
];

const VendorPayments = () => {
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<VendorPayment | null>(null);
  const [canManagePayments, setCanManagePayments] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form state
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [selectedBill, setSelectedBill] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    checkPermissions();

    const channel = supabase
      .channel('vendor-payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_payments' }, () => {
        fetchPayments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedVendor) {
      fetchBillsForVendor(selectedVendor);
    } else {
      setBills([]);
    }
  }, [selectedVendor]);

  const checkPermissions = async () => {
    if (!user) return;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const userRoles = roles?.map(r => r.role) || [];
    setIsAdmin(userRoles.includes('admin'));
    setCanManagePayments(userRoles.includes('admin') || userRoles.includes('accountant'));
  };

  const fetchData = async () => {
    await Promise.all([fetchPayments(), fetchVendors()]);
    setLoading(false);
  };

  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from('vendor_payments')
      .select('*, vendor:vendors(name), vendor_bill:vendor_bills(bill_number, total_amount)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setPayments(data || []);
    }
  };

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    setVendors(data || []);
  };

  const fetchBillsForVendor = async (vendorId: string) => {
    const { data } = await supabase
      .from('vendor_bills')
      .select('*')
      .eq('vendor_id', vendorId)
      .in('status', ['unpaid', 'partially_paid'])
      .order('bill_date', { ascending: false });
    setBills(data || []);
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVendor) {
      toast({ title: 'Error', description: 'Please select a vendor', variant: 'destructive' });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    try {
      const { data: paymentNumber } = await supabase.rpc('generate_vendor_payment_number');
      const vendorName = vendors.find(v => v.id === selectedVendor)?.name || 'Vendor';
      const selectedBillInfo = bills.find(b => b.id === selectedBill);
      const paymentAmount = parseFloat(amount);

      // Create vendor payment
      const { error: paymentError } = await supabase
        .from('vendor_payments')
        .insert([{
          payment_number: paymentNumber,
          vendor_id: selectedVendor,
          vendor_bill_id: selectedBill || null,
          amount: paymentAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference_number: referenceNumber || null,
          notes: notes || null,
          recorded_by: user?.id,
        }]);

      if (paymentError) throw paymentError;

      // Also create an expense record so it reflects in financial reports
      const expenseDescription = selectedBillInfo 
        ? `Vendor Payment to ${vendorName} - Bill ${selectedBillInfo.bill_number}`
        : `Vendor Payment to ${vendorName}`;

      // Map payment method to expense payment method enum
      const expensePaymentMethod = paymentMethod === 'bank_transfer' ? 'bank_transfer' 
        : paymentMethod === 'cash' ? 'cash' 
        : 'mobile_money'; // evc, zaad, sahal, other -> mobile_money

      const { error: expenseError } = await supabase
        .from('expenses')
        .insert([{
          expense_date: paymentDate,
          amount: paymentAmount,
          category: 'Vendor Payment',
          description: expenseDescription,
          payment_method: expensePaymentMethod,
          vendor_id: selectedVendor,
          supplier_name: vendorName,
          notes: notes || null,
          recorded_by: user?.id,
          approval_status: 'approved',
        }]);

      if (expenseError) throw expenseError;

      toast({ title: 'Success', description: 'Payment recorded successfully' });
      resetForm();
      setIsDialogOpen(false);
      fetchPayments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeletePayment = async () => {
    if (!selectedPayment) return;

    try {
      const { error } = await supabase
        .from('vendor_payments')
        .delete()
        .eq('id', selectedPayment.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Payment deleted successfully' });
      setIsDeleteDialogOpen(false);
      setSelectedPayment(null);
      fetchPayments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setSelectedVendor('');
    setSelectedBill('');
    setAmount('');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setPaymentMethod('cash');
    setReferenceNumber('');
    setNotes('');
  };

  const getMethodLabel = (method: string) => {
    return paymentMethods.find(m => m.value === method)?.label || method;
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = 
      payment.payment_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.vendor?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMethod = methodFilter === 'all' || payment.payment_method === methodFilter;
    
    return matchesSearch && matchesMethod;
  });

  // Stats
  const totalPayments = payments.length;
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const cashPayments = payments.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const mobilePayments = payments.filter(p => ['evc', 'zaad', 'sahal'].includes(p.payment_method)).reduce((sum, p) => sum + p.amount, 0);
  const bankPayments = payments.filter(p => p.payment_method === 'bank_transfer').reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading payments...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Vendor Payments</h1>
            <p className="text-muted-foreground">Record and track payments to vendors</p>
          </div>
          
          {canManagePayments && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Vendor Payment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreatePayment} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {bills.length > 0 && (
                    <div className="space-y-2">
                      <Label>Apply to Bill (Optional)</Label>
                      <Select value={selectedBill} onValueChange={setSelectedBill}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select bill" />
                        </SelectTrigger>
                        <SelectContent>
                          {bills.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.bill_number} - ${(b.total_amount - b.amount_paid).toFixed(2)} due
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Date</Label>
                      <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Reference Number</Label>
                    <Input
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="Transaction ID, check number, etc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </div>

                  <Button type="submit" className="w-full">Record Payment</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalPayments}</div><p className="text-sm text-muted-foreground">Total Payments</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-primary">${totalAmount.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Paid</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">${cashPayments.toLocaleString()}</div><p className="text-sm text-muted-foreground">Cash</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-600">${mobilePayments.toLocaleString()}</div><p className="text-sm text-muted-foreground">Mobile Money</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-purple-600">${bankPayments.toLocaleString()}</div><p className="text-sm text-muted-foreground">Bank Transfer</p></CardContent></Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search payment number, vendor, reference..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Payment Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              {paymentMethods.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Payments Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Payment #</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Bill</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Method</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-medium">{payment.payment_number}</td>
                      <td className="px-6 py-4">{payment.vendor?.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{payment.vendor_bill?.bill_number || '-'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(payment.payment_date), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{getMethodLabel(payment.payment_method)}</Badge>
                      </td>
                      <td className="px-6 py-4 font-medium text-green-600">${payment.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedPayment(payment); setIsViewDialogOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setSelectedPayment(payment); setIsDeleteDialogOpen(true); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPayments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No payments found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* View Payment Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Payment Details</DialogTitle>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">Payment Number</Label><p className="font-mono font-bold">{selectedPayment.payment_number}</p></div>
                  <div><Label className="text-muted-foreground">Amount</Label><p className="text-2xl font-bold text-green-600">${selectedPayment.amount.toLocaleString()}</p></div>
                  <div><Label className="text-muted-foreground">Vendor</Label><p>{selectedPayment.vendor?.name}</p></div>
                  <div><Label className="text-muted-foreground">Date</Label><p>{format(new Date(selectedPayment.payment_date), 'MMM d, yyyy')}</p></div>
                  <div><Label className="text-muted-foreground">Method</Label><p><Badge variant="outline">{getMethodLabel(selectedPayment.payment_method)}</Badge></p></div>
                  {selectedPayment.vendor_bill && (
                    <div><Label className="text-muted-foreground">Applied to Bill</Label><p>{selectedPayment.vendor_bill.bill_number}</p></div>
                  )}
                  {selectedPayment.reference_number && (
                    <div><Label className="text-muted-foreground">Reference</Label><p>{selectedPayment.reference_number}</p></div>
                  )}
                </div>
                {selectedPayment.notes && (
                  <div><Label className="text-muted-foreground">Notes</Label><p>{selectedPayment.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Payment</DialogTitle>
            </DialogHeader>
            <p>Are you sure you want to delete payment "{selectedPayment?.payment_number}"? This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeletePayment}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default VendorPayments;
