import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, Download, DollarSign, TrendingDown, TrendingUp, Building2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generatePaymentsReportPDF } from '@/utils/generatePaymentsReportPDF';
import { generateExpensesReportPDF } from '@/utils/generateExpensesReportPDF';

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
  discount_amount?: number;
  discount_type?: string;
  discount_reason?: string;
  order: {
    job_title: string;
    customer: {
      name: string;
    };
  } | null;
  invoice: {
    invoice_number: string;
    customer: {
      name: string;
    };
  } | null;
}

interface Expense {
  id: string;
  amount: number;
  category: string;
  expense_date: string;
  description: string;
  supplier_name?: string;
  payment_method: string;
  approval_status: string;
  notes?: string;
  vendor_id?: string;
}

interface Vendor {
  id: string;
  vendor_code: string;
  name: string;
  status: string;
}

interface VendorReport {
  vendor: Vendor;
  totalSpending: number;
  transactionCount: number;
}

interface CustomerBalance {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
}

const FinancialReports = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [expenseCategory, setExpenseCategory] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorReports, setVendorReports] = useState<VendorReport[]>([]);
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [activeTab, setActiveTab] = useState('payments');

  // Fetch initial data on mount
  useEffect(() => {
    fetchPayments();
    fetchExpenses();
    fetchVendors();
    fetchCustomerBalances();

    // Set up realtime subscription
    const channel = supabase
      .channel('financial-reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchPayments)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchExpenses)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, fetchVendors)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchCustomerBalances)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomerBalances)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payments')
        .select(`
          id,
          amount,
          payment_method,
          payment_date,
          reference_number,
          notes,
          discount_amount,
          discount_type,
          discount_reason,
          order:orders(
            job_title,
            customer:customers(name)
          ),
          invoice:invoices(
            invoice_number,
            customer:customers(name)
          )
        `)
        .order('payment_date', { ascending: false });

      if (dateFrom) {
        query = query.gte('payment_date', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('payment_date', format(dateTo, 'yyyy-MM-dd'));
      }
      if (paymentMethod && paymentMethod !== 'all') {
        query = query.eq('payment_method', paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque');
      }

      const { data, error } = await query;
      if (error) {
        console.error('Payments query error:', error);
        throw error;
      }

      console.log('Fetched payments:', data);
      setPayments(data || []);
      toast({
        title: 'Success',
        description: 'Payments report generated successfully',
      });
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch payments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (dateFrom) {
        query = query.gte('expense_date', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('expense_date', format(dateTo, 'yyyy-MM-dd'));
      }
      if (expenseCategory && expenseCategory !== 'all') {
        query = query.eq('category', expenseCategory);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Expenses query error:', error);
        throw error;
      }

      console.log('Fetched expenses:', data);
      setExpenses(data || []);
      toast({
        title: 'Success',
        description: 'Expenses report generated successfully',
      });
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch expenses',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const { data: vendorsData, error: vendorsError } = await supabase
        .from('vendors')
        .select('id, vendor_code, name, status')
        .eq('status', 'active')
        .order('name');

      if (vendorsError) throw vendorsError;
      setVendors(vendorsData || []);

      // Fetch expenses with vendor_id to calculate vendor reports
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('vendor_id, amount')
        .not('vendor_id', 'is', null);

      if (expensesError) throw expensesError;

      // Calculate vendor reports
      const vendorMap = new Map<string, { totalSpending: number; transactionCount: number }>();
      
      (expensesData || []).forEach((expense: { vendor_id: string | null; amount: number }) => {
        if (expense.vendor_id) {
          const existing = vendorMap.get(expense.vendor_id) || { totalSpending: 0, transactionCount: 0 };
          existing.totalSpending += expense.amount || 0;
          existing.transactionCount += 1;
          vendorMap.set(expense.vendor_id, existing);
        }
      });

      const reports: VendorReport[] = (vendorsData || []).map((vendor: Vendor) => ({
        vendor,
        totalSpending: vendorMap.get(vendor.id)?.totalSpending || 0,
        transactionCount: vendorMap.get(vendor.id)?.transactionCount || 0,
      })).filter((r: VendorReport) => r.totalSpending > 0)
        .sort((a: VendorReport, b: VendorReport) => b.totalSpending - a.totalSpending);

      setVendorReports(reports);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const fetchCustomerBalances = async () => {
    try {
      // Fetch all customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, name, email, phone, company_name')
        .order('name');

      if (customersError) throw customersError;

      // Fetch all invoices (excluding drafts for outstanding calculation)
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('customer_id, total_amount, amount_paid, status');

      if (invoicesError) throw invoicesError;

      // Calculate balances per customer
      const balanceMap = new Map<string, { totalBilled: number; totalPaid: number; outstanding: number; invoiceCount: number }>();

      (invoicesData || []).forEach((inv: { customer_id: string; total_amount: number; amount_paid: number; status: string }) => {
        const existing = balanceMap.get(inv.customer_id) || { totalBilled: 0, totalPaid: 0, outstanding: 0, invoiceCount: 0 };
        // Only count non-draft invoices for financial calculations
        if (inv.status !== 'draft') {
          existing.totalBilled += Number(inv.total_amount) || 0;
          existing.totalPaid += Number(inv.amount_paid) || 0;
          existing.outstanding = existing.totalBilled - existing.totalPaid;
          existing.invoiceCount += 1;
        }
        balanceMap.set(inv.customer_id, existing);
      });

      const balances: CustomerBalance[] = (customersData || []).map((customer) => ({
        ...customer,
        totalBilled: balanceMap.get(customer.id)?.totalBilled || 0,
        totalPaid: balanceMap.get(customer.id)?.totalPaid || 0,
        outstanding: balanceMap.get(customer.id)?.outstanding || 0,
        invoiceCount: balanceMap.get(customer.id)?.invoiceCount || 0,
      }));

      setCustomerBalances(balances);
    } catch (error) {
      console.error('Error fetching customer balances:', error);
    }
  };

  const handleExportPaymentsPDF = async () => {
    if (!payments.length) return;

    setGeneratingPDF(true);
    try {
      await generatePaymentsReportPDF(payments, {
        dateFrom,
        dateTo,
        paymentMethod,
      });
      
      toast({
        title: 'Success',
        description: 'Payments PDF report generated successfully',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF report',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleExportExpensesPDF = async () => {
    if (!expenses.length) return;

    setGeneratingPDF(true);
    try {
      await generateExpensesReportPDF(expenses, {
        dateFrom,
        dateTo,
        expenseCategory,
      });
      
      toast({
        title: 'Success',
        description: 'Expenses PDF report generated successfully',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF report',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalDiscounts = payments.reduce((sum, p) => sum + Number(p.discount_amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = totalPayments - totalExpenses;

  // Filter customer balances
  const filteredCustomerBalances = customerBalances.filter((customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      customer.company_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      customer.phone?.includes(customerSearch);
    
    if (balanceFilter === 'with_balance') {
      return matchesSearch && customer.outstanding > 0;
    } else if (balanceFilter === 'no_balance') {
      return matchesSearch && customer.outstanding <= 0;
    }
    return matchesSearch;
  });

  const totalOutstanding = filteredCustomerBalances.reduce((sum, c) => sum + c.outstanding, 0);
  const customersWithBalance = filteredCustomerBalances.filter(c => c.outstanding > 0).length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-muted-foreground">Generate and export payments and expenses reports</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">${totalPayments.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{payments.length} transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Discounts</CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">${totalDiscounts.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Payment discounts given</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">${totalExpenses.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{expenses.length} transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Income</CardTitle>
              <DollarSign className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", netIncome >= 0 ? "text-success" : "text-destructive")}>
                ${netIncome.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Payments - Expenses</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateFrom && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateTo && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Methods</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={fetchPayments} disabled={loading}>
                    {loading ? 'Generating...' : 'Refresh Report'}
                  </Button>
                  {payments.length > 0 && (
                    <Button onClick={handleExportPaymentsPDF} disabled={generatingPDF} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      {generatingPDF ? 'Generating PDF...' : 'Export PDF'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payments Table */}
            {loading ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">Loading payments...</p>
                </CardContent>
              </Card>
            ) : payments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2">Date</th>
                          <th className="text-left py-3 px-2">Customer</th>
                          <th className="text-left py-3 px-2">Order/Invoice</th>
                          <th className="text-left py-3 px-2">Method</th>
                          <th className="text-right py-3 px-2">Amount</th>
                          <th className="text-right py-3 px-2">Discount</th>
                          <th className="text-left py-3 px-2">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-b">
                            <td className="py-3 px-2">{format(new Date(payment.payment_date), 'MMM dd, yyyy')}</td>
                            <td className="py-3 px-2">
                              {payment.order?.customer?.name || payment.invoice?.customer?.name || 'N/A'}
                            </td>
                            <td className="py-3 px-2">
                              {payment.order?.job_title || payment.invoice?.invoice_number || 'N/A'}
                            </td>
                            <td className="py-3 px-2 capitalize">{payment.payment_method.replace('_', ' ')}</td>
                            <td className="py-3 px-2 text-right font-semibold text-success">${payment.amount.toFixed(2)}</td>
                            <td className="py-3 px-2 text-right text-orange-500">
                              {payment.discount_amount && payment.discount_amount > 0 
                                ? `$${payment.discount_amount.toFixed(2)}` 
                                : '-'}
                            </td>
                            <td className="py-3 px-2">{payment.reference_number || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-bold">
                          <td colSpan={4} className="py-3 px-2 text-right">Total:</td>
                          <td className="py-3 px-2 text-right text-success">${totalPayments.toFixed(2)}</td>
                          <td className="py-3 px-2 text-right text-orange-500">${totalDiscounts.toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No payment records found</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Expenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateFrom && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateTo && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="materials">Materials</SelectItem>
                        <SelectItem value="utilities">Utilities</SelectItem>
                        <SelectItem value="rent">Rent</SelectItem>
                        <SelectItem value="salaries">Salaries</SelectItem>
                        <SelectItem value="equipment">Equipment</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={fetchExpenses} disabled={loading}>
                    {loading ? 'Generating...' : 'Refresh Report'}
                  </Button>
                  {expenses.length > 0 && (
                    <Button onClick={handleExportExpensesPDF} disabled={generatingPDF} variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      {generatingPDF ? 'Generating PDF...' : 'Export PDF'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Expenses Table */}
            {loading ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">Loading expenses...</p>
                </CardContent>
              </Card>
            ) : expenses.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Expense Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2">Date</th>
                          <th className="text-left py-3 px-2">Description</th>
                          <th className="text-left py-3 px-2">Category</th>
                          <th className="text-left py-3 px-2">Supplier</th>
                          <th className="text-left py-3 px-2">Method</th>
                          <th className="text-right py-3 px-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id} className="border-b">
                            <td className="py-3 px-2">{format(new Date(expense.expense_date), 'MMM dd, yyyy')}</td>
                            <td className="py-3 px-2">{expense.description}</td>
                            <td className="py-3 px-2 capitalize">{expense.category}</td>
                            <td className="py-3 px-2">{expense.supplier_name || '-'}</td>
                            <td className="py-3 px-2 capitalize">{expense.payment_method.replace('_', ' ')}</td>
                            <td className="py-3 px-2 text-right font-semibold text-destructive">${expense.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-bold">
                          <td colSpan={5} className="py-3 px-2 text-right">Total:</td>
                          <td className="py-3 px-2 text-right text-destructive">${totalExpenses.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No expense records found</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            {/* Customer Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{filteredCustomerBalances.length}</div>
                  <p className="text-xs text-muted-foreground">In current filter</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">${totalOutstanding.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">Accounts receivable</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">With Balance</CardTitle>
                  <DollarSign className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-500">{customersWithBalance}</div>
                  <p className="text-xs text-muted-foreground">Customers owing money</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Customers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Search Customer</Label>
                    <Input
                      placeholder="Search by name, company, or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Balance Status</Label>
                    <Select value={balanceFilter} onValueChange={setBalanceFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        <SelectItem value="with_balance">With Outstanding Balance</SelectItem>
                        <SelectItem value="no_balance">Fully Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={fetchCustomerBalances} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh Report'}
                </Button>
              </CardContent>
            </Card>

            {/* Customer Balances Table */}
            {filteredCustomerBalances.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Customer Outstanding Balances</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2">Customer</th>
                          <th className="text-left py-3 px-2">Contact</th>
                          <th className="text-center py-3 px-2">Invoices</th>
                          <th className="text-right py-3 px-2">Total Billed</th>
                          <th className="text-right py-3 px-2">Total Paid</th>
                          <th className="text-right py-3 px-2">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomerBalances
                          .sort((a, b) => b.outstanding - a.outstanding)
                          .map((customer) => (
                            <tr key={customer.id} className="border-b hover:bg-muted/50">
                              <td className="py-3 px-2">
                                <div className="font-medium">{customer.name}</div>
                                {customer.company_name && (
                                  <div className="text-sm text-muted-foreground">{customer.company_name}</div>
                                )}
                              </td>
                              <td className="py-3 px-2">
                                <div className="text-sm">{customer.phone || '-'}</div>
                                <div className="text-sm text-muted-foreground">{customer.email || ''}</div>
                              </td>
                              <td className="py-3 px-2 text-center">{customer.invoiceCount}</td>
                              <td className="py-3 px-2 text-right">${customer.totalBilled.toFixed(2)}</td>
                              <td className="py-3 px-2 text-right text-success">${customer.totalPaid.toFixed(2)}</td>
                              <td className={cn(
                                "py-3 px-2 text-right font-semibold",
                                customer.outstanding > 0 ? "text-destructive" : "text-success"
                              )}>
                                ${customer.outstanding.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-bold bg-muted/30">
                          <td colSpan={3} className="py-3 px-2 text-right">Total:</td>
                          <td className="py-3 px-2 text-right">
                            ${filteredCustomerBalances.reduce((sum, c) => sum + c.totalBilled, 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right text-success">
                            ${filteredCustomerBalances.reduce((sum, c) => sum + c.totalPaid, 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right text-destructive">
                            ${totalOutstanding.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No customers found</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default FinancialReports;
