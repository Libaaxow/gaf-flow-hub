import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  Building2, 
  Phone, 
  Mail, 
  MapPin,
  DollarSign,
  TrendingUp,
  Receipt,
  Calendar,
  User
} from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, isAfter } from 'date-fns';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Vendor {
  id: string;
  vendor_code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method: string;
}

type DateFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

const VendorAnalytics = () => {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  useEffect(() => {
    if (vendorId) {
      fetchVendorData();
    }
  }, [vendorId]);

  const fetchVendorData = async () => {
    try {
      setLoading(true);

      // Fetch vendor
      const { data: vendorData, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (vendorError) throw vendorError;
      setVendor(vendorData);

      // Fetch expenses for this vendor
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('id, description, amount, category, expense_date, payment_method')
        .eq('vendor_id', vendorId)
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);
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

  // Get filter start date based on selected filter
  const getFilterStartDate = (filter: DateFilter): Date | null => {
    const now = new Date();
    switch (filter) {
      case 'daily':
        return startOfDay(now);
      case 'weekly':
        return startOfWeek(now, { weekStartsOn: 1 });
      case 'monthly':
        return startOfMonth(now);
      case 'yearly':
        return startOfYear(now);
      case 'all':
      default:
        return null;
    }
  };

  // Filter expenses based on date filter
  const filteredExpenses = useMemo(() => {
    const startDate = getFilterStartDate(dateFilter);
    if (!startDate) return expenses;
    return expenses.filter(expense => isAfter(new Date(expense.expense_date), startDate));
  }, [expenses, dateFilter]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!vendor) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Vendor not found</p>
          <Button onClick={() => navigate('/vendors')} className="mt-4">
            Back to Vendors
          </Button>
        </div>
      </Layout>
    );
  }

  // Calculate metrics
  const totalPurchases = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalTransactions = filteredExpenses.length;
  const averageTransaction = totalTransactions > 0 ? totalPurchases / totalTransactions : 0;

  // Calculate spending by category
  const spendingByCategory = filteredExpenses.reduce((acc, expense) => {
    const category = expense.category || 'Other';
    if (!acc[category]) acc[category] = 0;
    acc[category] += expense.amount || 0;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.entries(spendingByCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Spending over time
  const spendingByPeriod = filteredExpenses.reduce((acc, expense) => {
    let periodKey: string;
    const expenseDate = new Date(expense.expense_date);
    
    switch (dateFilter) {
      case 'daily':
        periodKey = format(expenseDate, 'HH:00');
        break;
      case 'weekly':
        periodKey = format(expenseDate, 'EEE');
        break;
      case 'monthly':
        periodKey = format(expenseDate, 'dd MMM');
        break;
      case 'yearly':
        periodKey = format(expenseDate, 'MMM');
        break;
      default:
        periodKey = format(expenseDate, 'MMM yyyy');
    }
    
    if (!acc[periodKey]) acc[periodKey] = 0;
    acc[periodKey] += expense.amount || 0;
    return acc;
  }, {} as Record<string, number>);

  const spendingData = Object.entries(spendingByPeriod)
    .map(([period, amount]) => ({ period, amount }));

  // Payment method breakdown
  const paymentMethodData = filteredExpenses.reduce((acc, expense) => {
    const method = expense.payment_method || 'unknown';
    const existing = acc.find(item => item.name === method);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: method, value: 1 });
    }
    return acc;
  }, [] as Array<{ name: string; value: number }>);

  const COLORS = ['#DA2227', '#393D8C', '#10b981', '#f59e0b', '#8b5cf6'];

  const getFilterLabel = (filter: DateFilter) => {
    switch (filter) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'yearly': return 'This Year';
      case 'all': return 'All Time';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/vendors')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <Building2 className="h-8 w-8" />
                {vendor.name}
              </h1>
              <p className="text-muted-foreground">Vendor Analytics & Transaction History</p>
            </div>
          </div>
          <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'} className="text-lg px-4 py-2">
            {vendor.status}
          </Badge>
        </div>

        {/* Date Filter Tabs */}
        <Card>
          <CardContent className="pt-4">
            <Tabs value={dateFilter} onValueChange={(value) => setDateFilter(value as DateFilter)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
                <TabsTrigger value="all">All Time</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Vendor Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Vendor Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Vendor Code</p>
                  <p className="font-medium font-mono">{vendor.vendor_code}</p>
                </div>
              </div>
              {vendor.contact_person && (
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{vendor.contact_person}</p>
                  </div>
                </div>
              )}
              {vendor.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{vendor.phone}</p>
                  </div>
                </div>
              )}
              {vendor.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{vendor.email}</p>
                  </div>
                </div>
              )}
              {vendor.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">{vendor.address}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Vendor Since</p>
                  <p className="font-medium">{format(new Date(vendor.created_at), 'PP')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">${totalPurchases.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {getFilterLabel(dateFilter)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <Receipt className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-secondary">{totalTransactions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {getFilterLabel(dateFilter)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Transaction</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">${averageTransaction.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Per expense record
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Spending Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Spending Over Time</CardTitle>
              <CardDescription>{getFilterLabel(dateFilter)}</CardDescription>
            </CardHeader>
            <CardContent>
              {spendingData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={spendingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No spending data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Spending by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Spending by Category</CardTitle>
              <CardDescription>Distribution of expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No category data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History (Vendor Ledger)</CardTitle>
            <CardDescription>All expenses with this vendor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Payment Method</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm">{format(new Date(expense.expense_date), 'PP')}</td>
                      <td className="px-4 py-3 text-sm font-medium">{expense.description}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{expense.category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize">{expense.payment_method.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right">${expense.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        No transactions found for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default VendorAnalytics;
