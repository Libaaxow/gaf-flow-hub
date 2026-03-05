import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, subMonths, isAfter, isBefore, parseISO } from 'date-fns';
import { DollarSign, TrendingUp, TrendingDown, FileText, Download, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart as RePieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';
import { generatePaymentsReportPDF } from '@/utils/generatePaymentsReportPDF';
import { useToast } from '@/hooks/use-toast';

type DateRange = 'today' | 'this_month' | 'last_month' | 'this_year' | 'last_6_months' | 'all';

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const Reports = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [loading, setLoading] = useState(true);

  // Raw data
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [beginningBalances, setBeginningBalances] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
    const channel = supabase
      .channel('reports-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchAllData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAllPaginated = async (fetchFn: (offset: number, batchSize: number) => Promise<any[]>) => {
    const allData: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const data = await fetchFn(offset, batchSize);
      if (data && data.length > 0) {
        allData.push(...data);
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }
    return allData;
  };

  const fetchAllData = async () => {
    try {
      const [invData, payData, expData, balData] = await Promise.all([
        fetchAllPaginated(async (offset, bs) => {
          const { data, error } = await supabase.from('invoices').select('*, customers(name)').neq('status', 'draft').range(offset, offset + bs - 1);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPaginated(async (offset, bs) => {
          const { data, error } = await supabase.from('payments').select('*, orders(job_title, customers(name)), invoices:invoice_id(invoice_number, customers(name))').range(offset, offset + bs - 1);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPaginated(async (offset, bs) => {
          const { data, error } = await supabase.from('expenses').select('*').range(offset, offset + bs - 1);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPaginated(async (offset, bs) => {
          const { data, error } = await supabase.from('beginning_balances').select('*').range(offset, offset + bs - 1);
          if (error) throw error;
          return data || [];
        }),
      ]);
      setInvoices(invData);
      setPayments(payData);
      setExpenses(expData);
      setBeginningBalances(balData);
    } catch (e) {
      console.error('Error fetching report data:', e);
    } finally {
      setLoading(false);
    }
  };

  const getDateBounds = (): { start: Date; end: Date } | null => {
    const now = new Date();
    switch (dateRange) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'this_month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month': { const lm = subMonths(now, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
      case 'this_year': return { start: startOfYear(now), end: endOfYear(now) };
      case 'last_6_months': return { start: startOfMonth(subMonths(now, 5)), end: endOfDay(now) };
      case 'all': return null;
    }
  };

  const inRange = (dateStr: string) => {
    const bounds = getDateBounds();
    if (!bounds) return true;
    const d = parseISO(dateStr);
    return !isBefore(d, bounds.start) && !isAfter(d, bounds.end);
  };

  // Filtered data
  const filteredInvoices = useMemo(() => invoices.filter(i => inRange(i.invoice_date)), [invoices, dateRange]);
  const filteredPayments = useMemo(() => payments.filter(p => inRange(p.payment_date)), [payments, dateRange]);
  const filteredExpenses = useMemo(() => expenses.filter(e => inRange(e.expense_date)), [expenses, dateRange]);

  // Summary metrics
  const totalSales = useMemo(() => filteredInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0), [filteredInvoices]);
  const totalCollected = useMemo(() => filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0), [filteredPayments]);
  const totalExpenses = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [filteredExpenses]);
  const netProfit = totalSales - totalExpenses;
  const cashBalance = useMemo(() => {
    const opening = beginningBalances.reduce((s, b) => s + Number(b.amount || 0), 0);
    return opening + totalCollected - totalExpenses;
  }, [beginningBalances, totalCollected, totalExpenses]);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; sales: number; expenses: number; collections: number }> = {};
    filteredInvoices.forEach(i => {
      const m = format(parseISO(i.invoice_date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, sales: 0, expenses: 0, collections: 0 };
      months[m].sales += Number(i.total_amount || 0);
    });
    filteredExpenses.forEach(e => {
      const m = format(parseISO(e.expense_date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, sales: 0, expenses: 0, collections: 0 };
      months[m].expenses += Number(e.amount || 0);
    });
    filteredPayments.forEach(p => {
      const m = format(parseISO(p.payment_date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, sales: 0, expenses: 0, collections: 0 };
      months[m].collections += Number(p.amount || 0);
    });
    return Object.values(months).sort((a, b) => {
      const da = new Date(a.month);
      const db = new Date(b.month);
      return da.getTime() - db.getTime();
    });
  }, [filteredInvoices, filteredExpenses, filteredPayments]);

  // Expense by category
  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'Uncategorized';
      cats[cat] = (cats[cat] || 0) + Number(e.amount || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  // Sales by customer
  const salesByCustomer = useMemo(() => {
    const custs: Record<string, { name: string; total: number; count: number }> = {};
    filteredInvoices.forEach(i => {
      const name = i.customers?.name || 'Unknown';
      if (!custs[name]) custs[name] = { name, total: 0, count: 0 };
      custs[name].total += Number(i.total_amount || 0);
      custs[name].count += 1;
    });
    return Object.values(custs).sort((a, b) => b.total - a.total);
  }, [filteredInvoices]);

  // Invoice status breakdown
  const invoiceStatusBreakdown = useMemo(() => {
    const statuses: Record<string, number> = {};
    filteredInvoices.forEach(i => {
      const s = i.status || 'unknown';
      statuses[s] = (statuses[s] || 0) + 1;
    });
    return Object.entries(statuses).map(([name, value]) => ({ name: name.replace('_', ' '), value }));
  }, [filteredInvoices]);

  const paidInvoices = filteredInvoices.filter(i => i.status === 'paid');
  const unpaidInvoices = filteredInvoices.filter(i => ['unpaid', 'pending'].includes(i.status));
  const partialInvoices = filteredInvoices.filter(i => i.status === 'partially_paid');
  const overdueInvoices = filteredInvoices.filter(i => {
    if (i.status === 'paid') return false;

    const now = new Date();
    const oneMonthAgo = subMonths(now, 1);

    // If due date exists, normal overdue logic
    if (i.due_date) {
      return isBefore(parseISO(i.due_date), now);
    }

    // If no due date, treat invoices older than one month as overdue
    const invoiceReferenceDate = i.invoice_date || i.created_at;
    if (!invoiceReferenceDate) return false;

    return isBefore(parseISO(invoiceReferenceDate), oneMonthAgo);
  });

  // Cash flow chart data
  const cashFlowData = useMemo(() => {
    const months: Record<string, { month: string; cashIn: number; cashOut: number }> = {};
    filteredPayments.forEach(p => {
      const m = format(parseISO(p.payment_date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, cashIn: 0, cashOut: 0 };
      months[m].cashIn += Number(p.amount || 0);
    });
    filteredExpenses.forEach(e => {
      const m = format(parseISO(e.expense_date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, cashIn: 0, cashOut: 0 };
      months[m].cashOut += Number(e.amount || 0);
    });
    return Object.values(months).sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  }, [filteredPayments, filteredExpenses]);

  const handleExportPaymentsPDF = () => {
    try {
      const mapped = filteredPayments.map(p => ({
        amount: Number(p.amount),
        payment_method: p.payment_method,
        payment_date: p.payment_date,
        reference_number: p.reference_number,
        notes: p.notes,
        discount_amount: p.discount_amount ? Number(p.discount_amount) : undefined,
        discount_type: p.discount_type,
        discount_reason: p.discount_reason,
        order: p.orders ? { job_title: p.orders.job_title, customer: { name: p.orders.customers?.name || 'N/A' } } : null,
        invoice: p.invoices ? { invoice_number: p.invoices.invoice_number, customer: { name: p.invoices.customers?.name || 'N/A' } } : null,
      }));
      generatePaymentsReportPDF(mapped, {});
      toast({ title: 'PDF Generated', description: 'Payments report downloaded.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-16 w-16 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading financial reports...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 w-full max-w-full overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
            <p className="text-sm text-muted-foreground">Comprehensive financial analytics & reporting</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportPaymentsPDF}>
              <Download className="h-4 w-4 mr-1" /> Export PDF
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard title="Total Sales" value={totalSales} icon={<TrendingUp className="h-4 w-4" />} color="text-primary" />
          <SummaryCard title="Collected" value={totalCollected} icon={<ArrowUpRight className="h-4 w-4" />} color="text-emerald-600" />
          <SummaryCard title="Expenses" value={totalExpenses} icon={<ArrowDownRight className="h-4 w-4" />} color="text-destructive" />
          <SummaryCard title="Net Profit" value={netProfit} icon={<DollarSign className="h-4 w-4" />} color={netProfit >= 0 ? 'text-emerald-600' : 'text-destructive'} />
          <SummaryCard title="Cash Balance" value={cashBalance} icon={<Wallet className="h-4 w-4" />} color="text-primary" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>
            <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">Sales</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs">Expenses</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs">Invoices</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Monthly Sales vs Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Legend />
                        <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2"><PieChart className="h-4 w-4" /> Expenses by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {expenseByCategory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                            {expenseByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        </RePieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No expense data</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cash Flow Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Cash Flow (In vs Out)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                      <Legend />
                      <Area type="monotone" dataKey="cashIn" name="Cash In" stroke="#10b981" fill="#10b98133" />
                      <Area type="monotone" dataKey="cashOut" name="Cash Out" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* P&L Tab */}
          <TabsContent value="pnl" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Profit & Loss Statement</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-semibold">Total Sales (Invoiced)</TableCell>
                      <TableCell className="text-right font-semibold text-primary">${totalSales.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold">Total Collected</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">${totalCollected.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold text-destructive">Total Expenses</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">-${totalExpenses.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold text-lg">Outstanding (Uncollected)</TableCell>
                      <TableCell className="text-right font-bold text-lg text-amber-600">${(totalSales - totalCollected).toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-bold text-lg">Net Profit (Sales - Expenses)</TableCell>
                      <TableCell className={`text-right font-bold text-lg ${netProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>${netProfit.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                {/* Expense breakdown within P&L */}
                {expenseByCategory.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Expense Breakdown</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenseByCategory.map(cat => (
                          <TableRow key={cat.name}>
                            <TableCell>{cat.name}</TableCell>
                            <TableCell className="text-right">${cat.value.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{totalExpenses > 0 ? ((cat.value / totalExpenses) * 100).toFixed(1) : 0}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cash Flow Tab */}
          <TabsContent value="cashflow" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Cash In (Payments)</p>
                  <p className="text-xl font-bold text-emerald-600">${totalCollected.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Cash Out (Expenses)</p>
                  <p className="text-xl font-bold text-destructive">${totalExpenses.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-primary">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Net Cash Balance</p>
                  <p className="text-xl font-bold text-primary">${cashBalance.toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cash Flow Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                      <Legend />
                      <Line type="monotone" dataKey="cashIn" name="Cash In" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="cashOut" name="Cash Out" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Sales Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top Customers by Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {salesByCustomer.slice(0, 10).map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                          <span className="text-sm truncate">{c.name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{c.count} inv</Badge>
                        </div>
                        <span className="text-sm font-semibold ml-2 shrink-0">${c.total.toFixed(2)}</span>
                      </div>
                    ))}
                    {salesByCustomer.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">No sales data</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Expense Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    {expenseByCategory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={true} fontSize={10}>
                            {expenseByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                          <Legend />
                        </RePieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No expense data</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Expense Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Expense category table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Expense Categories Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseByCategory.map(cat => {
                      const count = filteredExpenses.filter(e => (e.category || 'Uncategorized') === cat.name).length;
                      return (
                        <TableRow key={cat.name}>
                          <TableCell className="font-medium">{cat.name}</TableCell>
                          <TableCell className="text-right">${cat.value.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{totalExpenses > 0 ? ((cat.value / totalExpenses) * 100).toFixed(1) : 0}%</TableCell>
                          <TableCell className="text-right">{count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-xl font-bold text-emerald-600">{paidInvoices.length}</p>
                  <p className="text-xs text-muted-foreground">${paidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Partially Paid</p>
                  <p className="text-xl font-bold text-amber-600">{partialInvoices.length}</p>
                  <p className="text-xs text-muted-foreground">${partialInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Unpaid</p>
                  <p className="text-xl font-bold text-destructive">{unpaidInvoices.length}</p>
                  <p className="text-xs text-muted-foreground">${unpaidInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-700">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Overdue</p>
                  <p className="text-xl font-bold text-red-700">{overdueInvoices.length}</p>
                  <p className="text-xs text-muted-foreground">${overdueInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0).toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Invoice status pie chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Invoice Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    {invoiceStatusBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie data={invoiceStatusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fontSize={10}>
                            {invoiceStatusBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </RePieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No invoice data</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">All Overdue Invoices ({overdueInvoices.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {overdueInvoices.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">No overdue invoices 🎉</p>
                    ) : (
                      overdueInvoices.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{inv.invoice_number}</p>
                            <p className="text-xs text-muted-foreground truncate">{inv.customers?.name}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-semibold text-destructive">${Number(inv.total_amount || 0).toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">Due: {inv.due_date ? format(parseISO(inv.due_date), 'MMM dd') : 'N/A'}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

// Summary card component
const SummaryCard = ({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>${value.toFixed(2)}</p>
    </CardContent>
  </Card>
);

export default Reports;
