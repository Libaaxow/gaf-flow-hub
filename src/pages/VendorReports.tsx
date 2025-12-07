import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Building2, TrendingUp, DollarSign, FileText, CreditCard } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface VendorSummary {
  id: string;
  name: string;
  vendor_code: string;
  status: string;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  billCount: number;
  poCount: number;
}

interface VendorPaymentHistory {
  id: string;
  payment_number: string;
  vendor_name: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  bill_number: string | null;
}

const VendorReports = () => {
  const [vendorSummaries, setVendorSummaries] = useState<VendorSummary[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<VendorPaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch vendors
      const { data: vendors, error: vendorsError } = await supabase
        .from('vendors')
        .select('id, name, vendor_code, status')
        .order('name');

      if (vendorsError) throw vendorsError;

      // Fetch vendor bills
      const { data: bills, error: billsError } = await supabase
        .from('vendor_bills')
        .select('vendor_id, total_amount, amount_paid');

      if (billsError) throw billsError;

      // Fetch purchase orders
      const { data: pos, error: posError } = await supabase
        .from('purchase_orders')
        .select('vendor_id, total_amount, status');

      if (posError) throw posError;

      // Calculate summaries
      const summaries: VendorSummary[] = (vendors || []).map(vendor => {
        const vendorBills = bills?.filter(b => b.vendor_id === vendor.id) || [];
        const vendorPOs = pos?.filter(p => p.vendor_id === vendor.id) || [];
        
        const totalPurchases = vendorBills.reduce((sum, b) => sum + Number(b.total_amount), 0);
        const totalPaid = vendorBills.reduce((sum, b) => sum + Number(b.amount_paid), 0);
        
        return {
          id: vendor.id,
          name: vendor.name,
          vendor_code: vendor.vendor_code,
          status: vendor.status,
          totalPurchases,
          totalPaid,
          outstanding: totalPurchases - totalPaid,
          billCount: vendorBills.length,
          poCount: vendorPOs.length,
        };
      });

      setVendorSummaries(summaries);

      // Fetch payment history
      const { data: payments, error: paymentsError } = await supabase
        .from('vendor_payments')
        .select('id, payment_number, vendor_id, amount, payment_date, payment_method, vendor_bill_id')
        .order('payment_date', { ascending: false })
        .limit(100);

      if (paymentsError) throw paymentsError;

      // Get vendor and bill info for payments
      const paymentHistoryData: VendorPaymentHistory[] = [];
      for (const payment of payments || []) {
        const vendor = vendors?.find(v => v.id === payment.vendor_id);
        let billNumber = null;
        
        if (payment.vendor_bill_id) {
          const { data: bill } = await supabase
            .from('vendor_bills')
            .select('bill_number')
            .eq('id', payment.vendor_bill_id)
            .maybeSingle();
          billNumber = bill?.bill_number || null;
        }

        paymentHistoryData.push({
          id: payment.id,
          payment_number: payment.payment_number,
          vendor_name: vendor?.name || 'Unknown',
          amount: payment.amount,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          bill_number: billNumber,
        });
      }

      setPaymentHistory(paymentHistoryData);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank Transfer',
      evc: 'EVC Plus',
      zaad: 'Zaad',
      sahal: 'Sahal',
      other: 'Other',
    };
    return methods[method] || method;
  };

  const filteredVendors = vendorSummaries.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.vendor_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalVendors = vendorSummaries.length;
  const totalPurchases = vendorSummaries.reduce((sum, v) => sum + v.totalPurchases, 0);
  const totalPaid = vendorSummaries.reduce((sum, v) => sum + v.totalPaid, 0);
  const totalOutstanding = vendorSummaries.reduce((sum, v) => sum + v.outstanding, 0);
  const vendorsWithBalance = vendorSummaries.filter(v => v.outstanding > 0).length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading vendor reports...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendor Reports</h1>
          <p className="text-muted-foreground">Purchase summaries, outstanding payables, and payment history</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold">{totalVendors}</div>
                  <p className="text-sm text-muted-foreground">Total Vendors</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-blue-600">${totalPurchases.toLocaleString()}</div>
                  <p className="text-sm text-muted-foreground">Total Purchases</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-green-600">${totalPaid.toLocaleString()}</div>
                  <p className="text-sm text-muted-foreground">Total Paid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-destructive" />
                <div>
                  <div className="text-2xl font-bold text-destructive">${totalOutstanding.toLocaleString()}</div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-yellow-600" />
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{vendorsWithBalance}</div>
                  <p className="text-sm text-muted-foreground">With Balance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Vendor Summary</TabsTrigger>
            <TabsTrigger value="payables">Outstanding Payables</TabsTrigger>
            <TabsTrigger value="payments">Payment History</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search vendors..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Code</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">POs</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Bills</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Total Purchases</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Paid</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Outstanding</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map((vendor) => (
                        <tr key={vendor.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-medium">{vendor.name}</td>
                          <td className="px-6 py-4 font-mono text-sm text-muted-foreground">{vendor.vendor_code}</td>
                          <td className="px-6 py-4">{vendor.poCount}</td>
                          <td className="px-6 py-4">{vendor.billCount}</td>
                          <td className="px-6 py-4 font-medium">${vendor.totalPurchases.toLocaleString()}</td>
                          <td className="px-6 py-4 text-green-600">${vendor.totalPaid.toLocaleString()}</td>
                          <td className="px-6 py-4 font-medium text-destructive">${vendor.outstanding.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>
                              {vendor.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payables" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Payables by Vendor</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Total Billed</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Amount Paid</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Balance Due</th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">% Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorSummaries.filter(v => v.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).map((vendor) => (
                        <tr key={vendor.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-medium">{vendor.name}</td>
                          <td className="px-6 py-4">${vendor.totalPurchases.toLocaleString()}</td>
                          <td className="px-6 py-4 text-green-600">${vendor.totalPaid.toLocaleString()}</td>
                          <td className="px-6 py-4 font-bold text-destructive">${vendor.outstanding.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 rounded-full" 
                                  style={{ width: `${vendor.totalPurchases > 0 ? (vendor.totalPaid / vendor.totalPurchases) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {vendor.totalPurchases > 0 ? Math.round((vendor.totalPaid / vendor.totalPurchases) * 100) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {vendorSummaries.filter(v => v.outstanding > 0).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                            No outstanding payables
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Vendor Payments</CardTitle>
              </CardHeader>
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
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((payment) => (
                        <tr key={payment.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-sm">{payment.payment_number}</td>
                          <td className="px-6 py-4 font-medium">{payment.vendor_name}</td>
                          <td className="px-6 py-4 text-muted-foreground font-mono text-sm">{payment.bill_number || '-'}</td>
                          <td className="px-6 py-4 text-muted-foreground">{format(new Date(payment.payment_date), 'MMM d, yyyy')}</td>
                          <td className="px-6 py-4">
                            <Badge variant="outline">{getMethodLabel(payment.payment_method)}</Badge>
                          </td>
                          <td className="px-6 py-4 font-medium text-green-600">${payment.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      {paymentHistory.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                            No payment history found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default VendorReports;
