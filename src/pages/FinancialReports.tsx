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
import { CalendarIcon, Download, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
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
  order: {
    job_title: string;
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
}

const FinancialReports = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [expenseCategory, setExpenseCategory] = useState<string>('all');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [activeTab, setActiveTab] = useState('payments');

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
          order:orders(
            job_title,
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
      if (error) throw error;

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
      if (error) throw error;

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
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = totalPayments - totalExpenses;

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
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
                    {loading ? 'Generating...' : 'Generate Report'}
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
            {payments.length > 0 && (
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
                          <th className="text-left py-3 px-2">Order</th>
                          <th className="text-left py-3 px-2">Method</th>
                          <th className="text-right py-3 px-2">Amount</th>
                          <th className="text-left py-3 px-2">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className="border-b">
                            <td className="py-3 px-2">{format(new Date(payment.payment_date), 'MMM dd, yyyy')}</td>
                            <td className="py-3 px-2">{payment.order?.customer?.name || 'N/A'}</td>
                            <td className="py-3 px-2">{payment.order?.job_title || 'N/A'}</td>
                            <td className="py-3 px-2 capitalize">{payment.payment_method.replace('_', ' ')}</td>
                            <td className="py-3 px-2 text-right font-semibold text-success">${payment.amount.toFixed(2)}</td>
                            <td className="py-3 px-2">{payment.reference_number || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-bold">
                          <td colSpan={4} className="py-3 px-2 text-right">Total:</td>
                          <td className="py-3 px-2 text-right text-success">${totalPayments.toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
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
                    {loading ? 'Generating...' : 'Generate Report'}
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
            {expenses.length > 0 && (
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
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default FinancialReports;
