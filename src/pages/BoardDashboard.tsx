import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Users,
  FileText,
  CalendarIcon,
  Package,
  BarChart3,
  PieChart,
  Eye
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, PieChart as RechartPie, Pie, Cell } from 'recharts';

interface FinancialStats {
  totalRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  totalExpenses: number;
  netProfit: number;
  totalCommissions: number;
  paidCommissions: number;
  unpaidCommissions: number;
  totalOrders: number;
  completedOrders: number;
  totalCustomers: number;
  totalInvoices: number;
}

interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

const BoardDashboard = () => {
  const [stats, setStats] = useState<FinancialStats>({
    totalRevenue: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    totalExpenses: 0,
    netProfit: 0,
    totalCommissions: 0,
    paidCommissions: 0,
    unpaidCommissions: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalCustomers: 0,
    totalInvoices: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRangePreset, setDateRangePreset] = useState<string>('this_year');
  const [startDate, setStartDate] = useState<Date>(startOfYear(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfYear(new Date()));

  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    const today = new Date();

    switch (preset) {
      case 'this_month':
        setStartDate(startOfMonth(today));
        setEndDate(endOfMonth(today));
        break;
      case 'last_month':
        setStartDate(startOfMonth(subMonths(today, 1)));
        setEndDate(endOfMonth(subMonths(today, 1)));
        break;
      case 'this_year':
        setStartDate(startOfYear(today));
        setEndDate(endOfYear(today));
        break;
      case 'last_year':
        setStartDate(startOfYear(subYears(today, 1)));
        setEndDate(endOfYear(subYears(today, 1)));
        break;
      case 'all_time':
        setStartDate(new Date(2020, 0, 1));
        setEndDate(today);
        break;
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('order_value, amount_paid, status');
      
      if (ordersError) console.error('Board: orders error', ordersError);

      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('total_amount, amount_paid, order_id');
      
      if (invoicesError) console.error('Board: invoices error', invoicesError);

      const { data: commissionsData, error: commissionsError } = await supabase
        .from('commissions')
        .select('commission_amount, paid_status');
      
      if (commissionsError) console.error('Board: commissions error', commissionsError);

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('amount, approval_status')
        .eq('approval_status', 'approved');
      
      if (expensesError) console.error('Board: expenses error', expensesError);

      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      console.log('Board fetchStats data counts:', {
        orders: ordersData?.length,
        invoices: invoicesData?.length,
        commissions: commissionsData?.length,
        expenses: expensesData?.length,
      });

      const orderRevenue = ordersData?.reduce((sum, order) => sum + Number(order.order_value || 0), 0) || 0;
      const orderCollected = ordersData?.reduce((sum, order) => sum + Number(order.amount_paid || 0), 0) || 0;

      const standaloneInvoices = invoicesData?.filter(inv => !inv.order_id) || [];
      const invoiceRevenue = standaloneInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const invoiceCollected = standaloneInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);

      const totalRevenue = orderRevenue + invoiceRevenue;
      const collectedAmount = orderCollected + invoiceCollected;
      const outstandingAmount = totalRevenue - collectedAmount;
      const totalExpenses = expensesData?.reduce((sum, exp) => sum + Number(exp.amount || 0), 0) || 0;
      const netProfit = collectedAmount - totalExpenses;

      const totalCommissions = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const paidCommissions = commissionsData?.filter(c => c.paid_status === 'paid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;
      const unpaidCommissions = commissionsData?.filter(c => c.paid_status === 'unpaid').reduce((sum, c) => sum + Number(c.commission_amount || 0), 0) || 0;

      const totalOrders = ordersData?.length || 0;
      const completedOrders = ordersData?.filter(o => o.status === 'completed' || o.status === 'delivered').length || 0;

      console.log('Board calculated stats:', {
        orderRevenue,
        invoiceRevenue,
        totalRevenue,
        orderCollected,
        invoiceCollected,
        collectedAmount,
        totalExpenses,
        netProfit,
      });

      setStats({
        totalRevenue,
        collectedAmount,
        outstandingAmount,
        totalExpenses,
        netProfit,
        totalCommissions,
        paidCommissions,
        unpaidCommissions,
        totalOrders,
        completedOrders,
        totalCustomers: customerCount || 0,
        totalInvoices: invoicesData?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchMonthlyData = useCallback(async () => {
    try {
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .gte('payment_date', startDate.toISOString())
        .lte('payment_date', endDate.toISOString());

      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, expense_date, approval_status')
        .eq('approval_status', 'approved')
        .gte('expense_date', startDate.toISOString())
        .lte('expense_date', endDate.toISOString());

      const monthlyMap = new Map<string, { revenue: number; expenses: number }>();

      payments?.forEach(p => {
        const month = format(new Date(p.payment_date), 'MMM yyyy');
        const existing = monthlyMap.get(month) || { revenue: 0, expenses: 0 };
        monthlyMap.set(month, { ...existing, revenue: existing.revenue + Number(p.amount || 0) });
      });

      expenses?.forEach(e => {
        const month = format(new Date(e.expense_date), 'MMM yyyy');
        const existing = monthlyMap.get(month) || { revenue: 0, expenses: 0 };
        monthlyMap.set(month, { ...existing, expenses: existing.expenses + Number(e.amount || 0) });
      });

      const data: MonthlyData[] = Array.from(monthlyMap.entries()).map(([month, values]) => ({
        month,
        revenue: values.revenue,
        expenses: values.expenses,
        profit: values.revenue - values.expenses,
      }));

      setMonthlyData(data.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime()));
    } catch (error) {
      console.error('Error fetching monthly data:', error);
    }
  }, [startDate, endDate]);

  const fetchRecentPayments = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          payment_method,
          payment_date,
          order:orders(job_title, customer:customers(name)),
          invoice:invoices(invoice_number, customer:customers(name))
        `)
        .order('payment_date', { ascending: false })
        .limit(10);

      setRecentPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  }, []);

  const fetchRecentExpenses = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .limit(10);

      setRecentExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  }, []);

  const fetchTopCustomers = useCallback(async () => {
    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('customer_id, total_amount, customer:customers(name)');

      const customerMap = new Map<string, { name: string; total: number }>();
      invoices?.forEach(inv => {
        const existing = customerMap.get(inv.customer_id) || { name: (inv.customer as any)?.name || 'Unknown', total: 0 };
        customerMap.set(inv.customer_id, { ...existing, total: existing.total + Number(inv.total_amount || 0) });
      });

      const sorted = Array.from(customerMap.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setTopCustomers(sorted);
    } catch (error) {
      console.error('Error fetching top customers:', error);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchMonthlyData(),
        fetchRecentPayments(),
        fetchRecentExpenses(),
        fetchTopCustomers(),
      ]);
    } catch (error) {
      console.error('Error fetching board data:', error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetchStats, fetchMonthlyData, fetchRecentPayments, fetchRecentExpenses, fetchTopCustomers]);

  const debouncedFetch = useCallback(() => {
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }
    refetchTimeoutRef.current = setTimeout(() => {
      fetchAllData();
    }, 1000);
  }, [fetchAllData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const channel = supabase
      .channel('board-all-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, debouncedFetch)
      .subscribe();

    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [debouncedFetch]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const expenseCategories = recentExpenses.reduce((acc, exp) => {
    const cat = exp.category || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(exp.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(expenseCategories).map(([name, value]) => ({ name, value }));
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', '#10B981', '#F59E0B'];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading board dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              Board Dashboard
            </h1>
            <p className="text-muted-foreground">
              Shareholder financial overview — View only
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary border-primary">
              <Eye className="h-3 w-3 mr-1" />
              View Only
            </Badge>
            <Select value={dateRangePreset} onValueChange={handleDatePresetChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(stats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">All time revenue</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collected Amount</CardTitle>
              <Wallet className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.collectedAmount)}</div>
              <p className="text-xs text-muted-foreground">Cash received</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <Receipt className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{formatCurrency(stats.outstandingAmount)}</div>
              <p className="text-xs text-muted-foreground">Pending collection</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpenses)}</div>
              <p className="text-xs text-muted-foreground">Approved expenses</p>
            </CardContent>
          </Card>
        </div>

        {/* Profit & Commission Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className={cn("border-l-4", stats.netProfit >= 0 ? "border-l-green-500" : "border-l-red-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              {stats.netProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", stats.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(stats.netProfit)}
              </div>
              <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-secondary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Commissions</CardTitle>
              <Users className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-secondary">{formatCurrency(stats.paidCommissions)}</div>
              <p className="text-xs text-muted-foreground">To staff</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.unpaidCommissions)}</div>
              <p className="text-xs text-muted-foreground">Owed to staff</p>
            </CardContent>
          </Card>
        </div>

        {/* Business Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">{stats.completedOrders} completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalInvoices}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCustomers}</div>
              <p className="text-xs text-muted-foreground">Active customers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalCommissions)}</div>
              <p className="text-xs text-muted-foreground">All staff</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Revenue vs Expenses
              </CardTitle>
              <CardDescription>Monthly comparison</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Expenses" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available for selected period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" />
                Expense Breakdown
              </CardTitle>
              <CardDescription>By category</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartPie>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </RechartPie>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No expense data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tables */}
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="payments">Recent Payments</TabsTrigger>
            <TabsTrigger value="expenses">Recent Expenses</TabsTrigger>
            <TabsTrigger value="customers">Top Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>Last 10 payments received</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(new Date(payment.payment_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            {payment.order?.customer?.name || payment.invoice?.customer?.name || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {payment.order?.job_title || payment.invoice?.invoice_number || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{payment.payment_method}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(Number(payment.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                      {recentPayments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No recent payments
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses">
            <Card>
              <CardHeader>
                <CardTitle>Recent Expenses</CardTitle>
                <CardDescription>Last 10 recorded expenses</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{format(new Date(expense.expense_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{expense.category}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{expense.description}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={expense.approval_status === 'approved' ? 'default' : 'outline'}
                              className="capitalize"
                            >
                              {expense.approval_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {formatCurrency(Number(expense.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                      {recentExpenses.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No recent expenses
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers">
            <Card>
              <CardHeader>
                <CardTitle>Top Customers</CardTitle>
                <CardDescription>By total invoice value</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCustomers.map((customer, index) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <Badge variant={index === 0 ? 'default' : 'secondary'}>#{index + 1}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {formatCurrency(customer.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {topCustomers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No customer data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default BoardDashboard;