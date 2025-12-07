import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, FileText, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface VendorBill {
  id: string;
  bill_number: string;
  vendor_id: string;
  vendor?: { name: string };
  purchase_order_id: string | null;
  purchase_order?: { po_number: string } | null;
  bill_date: string;
  due_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
  notes: string | null;
  created_at: string;
}

const VendorBills = () => {
  const navigate = useNavigate();
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<VendorBill | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchBills();

    const channel = supabase
      .channel('vendor-bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_bills' }, () => {
        fetchBills();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBills = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_bills')
        .select('*, vendor:vendors(name), purchase_order:purchase_orders(po_number)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBills(data || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      unpaid: 'destructive',
      partially_paid: 'outline',
      paid: 'default',
    };
    const labels: Record<string, string> = {
      unpaid: 'Unpaid',
      partially_paid: 'Partial',
      paid: 'Paid',
    };
    return <Badge variant={variants[status] || 'secondary'}>{labels[status] || status}</Badge>;
  };

  const filteredBills = bills.filter(bill => {
    const matchesSearch = 
      bill.bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.vendor?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.purchase_order?.po_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalBills = bills.length;
  const unpaidBills = bills.filter(b => b.status === 'unpaid').length;
  const partialBills = bills.filter(b => b.status === 'partially_paid').length;
  const totalPayable = bills.reduce((sum, b) => sum + b.total_amount, 0);
  const totalOutstanding = bills.reduce((sum, b) => sum + (b.total_amount - b.amount_paid), 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading vendor bills...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Vendor Bills</h1>
            <p className="text-muted-foreground">Track payables from received purchase orders</p>
          </div>
          <Button onClick={() => navigate('/vendor-payments')}>
            <DollarSign className="mr-2 h-4 w-4" />
            Make Payment
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalBills}</div><p className="text-sm text-muted-foreground">Total Bills</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-destructive">{unpaidBills}</div><p className="text-sm text-muted-foreground">Unpaid</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{partialBills}</div><p className="text-sm text-muted-foreground">Partial</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-primary">${totalPayable.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Payable</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-destructive">${totalOutstanding.toLocaleString()}</div><p className="text-sm text-muted-foreground">Outstanding</p></CardContent></Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search bill number, vendor, PO..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partially_paid">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bills Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Bill #</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">PO</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Paid</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Balance</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map((bill) => (
                    <tr key={bill.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-medium">{bill.bill_number}</td>
                      <td className="px-6 py-4">{bill.vendor?.name}</td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-sm">{bill.purchase_order?.po_number || '-'}</td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(bill.bill_date), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 font-medium">${bill.total_amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-green-600">${bill.amount_paid.toLocaleString()}</td>
                      <td className="px-6 py-4 text-destructive font-medium">${(bill.total_amount - bill.amount_paid).toLocaleString()}</td>
                      <td className="px-6 py-4">{getStatusBadge(bill.status)}</td>
                      <td className="px-6 py-4">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedBill(bill); setIsViewDialogOpen(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No vendor bills found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* View Bill Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bill Details</DialogTitle>
            </DialogHeader>
            {selectedBill && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">Bill Number</Label><p className="font-mono font-bold">{selectedBill.bill_number}</p></div>
                  <div><Label className="text-muted-foreground">Status</Label><p>{getStatusBadge(selectedBill.status)}</p></div>
                  <div><Label className="text-muted-foreground">Vendor</Label><p>{selectedBill.vendor?.name}</p></div>
                  <div><Label className="text-muted-foreground">Bill Date</Label><p>{format(new Date(selectedBill.bill_date), 'MMM d, yyyy')}</p></div>
                  {selectedBill.purchase_order && (
                    <div><Label className="text-muted-foreground">Purchase Order</Label><p className="font-mono">{selectedBill.purchase_order.po_number}</p></div>
                  )}
                  {selectedBill.due_date && (
                    <div><Label className="text-muted-foreground">Due Date</Label><p>{format(new Date(selectedBill.due_date), 'MMM d, yyyy')}</p></div>
                  )}
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between"><span>Subtotal:</span><span>${selectedBill.subtotal.toFixed(2)}</span></div>
                  {selectedBill.vat_amount > 0 && <div className="flex justify-between"><span>VAT:</span><span>${selectedBill.vat_amount.toFixed(2)}</span></div>}
                  <div className="flex justify-between font-bold"><span>Total:</span><span>${selectedBill.total_amount.toFixed(2)}</span></div>
                  <div className="flex justify-between text-green-600"><span>Paid:</span><span>${selectedBill.amount_paid.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-destructive border-t pt-2"><span>Balance Due:</span><span>${(selectedBill.total_amount - selectedBill.amount_paid).toFixed(2)}</span></div>
                </div>

                {selectedBill.notes && (
                  <div><Label className="text-muted-foreground">Notes</Label><p>{selectedBill.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default VendorBills;
