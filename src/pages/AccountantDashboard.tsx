import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Plus,
  Receipt,
  FileText,
  Users,
  Calendar
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface FinancialStats {
  totalRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  totalExpenses: number;
  profit: number;
  pendingCommissions: number;
  paidCommissions: number;
}

interface OrderWithDetails {
  id: string;
  job_title: string;
  order_value: number;
  amount_paid: number;
  payment_status: string;
  payment_method?: string;
  created_at: string;
  customer: {
    name: string;
  };
}

interface Commission {
  id: string;
  commission_amount: number;
  commission_percentage: number;
  paid_status: string;
  created_at: string;
  order: {
    job_title: string;
  };
  salesperson: {
    full_name: string;
  };
}

interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  supplier_name?: string;
  approval_status: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  order: {
    job_title: string;
    customer: {
      name: string;
    };
  };
}

const AccountantDashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<FinancialStats>({
    totalRevenue: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    totalExpenses: 0,
    profit: 0,
    pendingCommissions: 0,
    paidCommissions: 0,
  });
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);

      // Fetch orders with customer details
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          job_title,
          order_value,
          amount_paid,
          payment_status,
          payment_method,
          created_at,
          customer:customers(name)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch commissions
      const { data: commissionsData, error: commissionsError } = await supabase
        .from('commissions')
        .select(`
          id,
          commission_amount,
          commission_percentage,
          paid_status,
          created_at,
          salesperson_id,
          order_id
        `)
        .order('created_at', { ascending: false });

      // Fetch salesperson and order details separately
      let enrichedCommissions: Commission[] = [];
      if (commissionsData) {
        const commissionsWithDetails = await Promise.all(
          commissionsData.map(async (comm) => {
            const { data: salesperson } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', comm.salesperson_id)
              .single();

            const { data: order } = await supabase
              .from('orders')
              .select('job_title')
              .eq('id', comm.order_id)
              .single();

            return {
              ...comm,
              salesperson: salesperson || { full_name: 'Unknown' },
              order: order || { job_title: 'Unknown' },
            };
          })
        );
        enrichedCommissions = commissionsWithDetails;
      }

      if (commissionsError) throw commissionsError;

      setCommissions(enrichedCommissions);

      // Fetch expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;

      // Fetch payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          payment_method,
          payment_date,
          reference_number,
          order:orders(
            job_title,
            customer:customers(name)
          )
        `)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      setOrders(ordersData || []);
      setExpenses(expensesData || []);
      setPayments(paymentsData || []);

      // Calculate statistics
      const totalRevenue = ordersData?.reduce((sum, order) => sum + Number(order.order_value || 0), 0) || 0;
      const collectedAmount = ordersData?.reduce((sum, order) => sum + Number(order.amount_paid || 0), 0) || 0;
      const outstandingAmount = totalRevenue - collectedAmount;
      const totalExpenses = expensesData?.filter(e => e.approval_status === 'approved').reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || 0;
      const profit = collectedAmount - totalExpenses;
      const pendingCommissions = commissionsData?.filter(c => c.paid_status === 'unpaid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;
      const paidCommissions = commissionsData?.filter(c => c.paid_status === 'paid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;

      setStats({
        totalRevenue,
        collectedAmount,
        outstandingAmount,
        totalExpenses,
        profit,
        pendingCommissions,
        paidCommissions,
      });
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

  const handleRecordPayment = async () => {
    if (!selectedOrder || !paymentAmount || !paymentMethod) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert payment record
      const { error: paymentError } = await supabase
        .from('payments')
        .insert([{
          order_id: selectedOrder,
          amount: parseFloat(paymentAmount),
          payment_method: paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
          reference_number: paymentReference || null,
          notes: paymentNotes || null,
          recorded_by: user?.id,
        }]);

      if (paymentError) throw paymentError;

      // Update order amount_paid
      const order = orders.find(o => o.id === selectedOrder);
      if (order) {
        const newAmountPaid = Number(order.amount_paid || 0) + parseFloat(paymentAmount);
        const newPaymentStatus = newAmountPaid >= order.order_value ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            amount_paid: newAmountPaid,
            payment_status: newPaymentStatus as 'unpaid' | 'partial' | 'paid',
            payment_method: paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
          })
          .eq('id', selectedOrder);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Success',
        description: 'Payment recorded successfully',
      });

      // Reset form
      setSelectedOrder('');
      setPaymentAmount('');
      setPaymentMethod('');
      setPaymentReference('');
      setPaymentNotes('');
      
      fetchFinancialData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRecordExpense = async () => {
    if (!expenseDate || !expenseCategory || !expenseDescription || !expenseAmount || !expensePaymentMethod) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('expenses')
        .insert([{
          expense_date: expenseDate,
          category: expenseCategory,
          description: expenseDescription,
          amount: parseFloat(expenseAmount),
          payment_method: expensePaymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
          supplier_name: expenseSupplier || null,
          notes: expenseNotes || null,
          recorded_by: user?.id,
          approval_status: 'approved', // Auto-approve for accountants
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Expense recorded successfully',
      });

      // Reset form
      setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
      setExpenseCategory('');
      setExpenseDescription('');
      setExpenseAmount('');
      setExpensePaymentMethod('');
      setExpenseSupplier('');
      setExpenseNotes('');
      
      fetchFinancialData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handlePayCommission = async (commissionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('commissions')
        .update({
          paid_status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
        })
        .eq('id', commissionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Commission marked as paid',
      });

      fetchFinancialData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const statCards = [
    {
      title: 'Total Revenue',
      value: `GH₵${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      description: 'Total order value',
      color: 'text-blue-600',
    },
    {
      title: 'Amount Collected',
      value: `GH₵${stats.collectedAmount.toFixed(2)}`,
      icon: TrendingUp,
      description: 'Payments received',
      color: 'text-green-600',
    },
    {
      title: 'Outstanding',
      value: `GH₵${stats.outstandingAmount.toFixed(2)}`,
      icon: Clock,
      description: 'Pending payments',
      color: 'text-orange-600',
    },
    {
      title: 'Total Expenses',
      value: `GH₵${stats.totalExpenses.toFixed(2)}`,
      icon: TrendingDown,
      description: 'Operational costs',
      color: 'text-red-600',
    },
    {
      title: 'Net Profit',
      value: `GH₵${stats.profit.toFixed(2)}`,
      icon: DollarSign,
      description: 'Revenue - Expenses',
      color: stats.profit >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Pending Commissions',
      value: `GH₵${stats.pendingCommissions.toFixed(2)}`,
      icon: AlertCircle,
      description: 'Unpaid commissions',
      color: 'text-yellow-600',
    },
  ];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading financial data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Accountant Dashboard</h1>
          <p className="text-muted-foreground">Financial management and reporting</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="payments">Payment Management</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          {/* Payment Management Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Payment Management</CardTitle>
                    <p className="text-sm text-muted-foreground">Record and track customer payments</p>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Record Payment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                        <DialogDescription>
                          Record a new payment for an order
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="order">Order *</Label>
                          <Select value={selectedOrder} onValueChange={setSelectedOrder}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select order" />
                            </SelectTrigger>
                            <SelectContent>
                              {orders.filter(o => o.payment_status !== 'paid').map((order) => (
                                <SelectItem key={order.id} value={order.id}>
                                  {order.job_title} - {order.customer.name} (Outstanding: GH₵{(order.order_value - order.amount_paid).toFixed(2)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="amount">Amount *</Label>
                          <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="method">Payment Method *</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="mobile_money">Mobile Money</SelectItem>
                              <SelectItem value="cheque">Cheque</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="reference">Reference Number</Label>
                          <Input
                            id="reference"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Transaction reference"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea
                            id="notes"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            placeholder="Additional notes"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleRecordPayment}>Record Payment</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Order Value</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.job_title}</TableCell>
                        <TableCell>{order.customer.name}</TableCell>
                        <TableCell>GH₵{order.order_value.toFixed(2)}</TableCell>
                        <TableCell>GH₵{order.amount_paid.toFixed(2)}</TableCell>
                        <TableCell>GH₵{(order.order_value - order.amount_paid).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.payment_status === 'paid'
                                ? 'default'
                                : order.payment_status === 'partial'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {order.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {order.payment_method ? (
                            <Badge variant="outline">
                              {order.payment_method.replace('_', ' ')}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Recent Payments */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.slice(0, 10).map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.payment_date), 'PP')}</TableCell>
                        <TableCell>{payment.order.job_title}</TableCell>
                        <TableCell>{payment.order.customer.name}</TableCell>
                        <TableCell>GH₵{payment.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {payment.payment_method.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{payment.reference_number || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Commission Management</CardTitle>
                <p className="text-sm text-muted-foreground">Track and pay salesperson commissions</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>{format(new Date(commission.created_at), 'PP')}</TableCell>
                        <TableCell>{commission.salesperson.full_name}</TableCell>
                        <TableCell>{commission.order.job_title}</TableCell>
                        <TableCell>{commission.commission_percentage}%</TableCell>
                        <TableCell>GH₵{commission.commission_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={commission.paid_status === 'paid' ? 'default' : 'destructive'}
                          >
                            {commission.paid_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {commission.paid_status === 'unpaid' && (
                            <Button
                              size="sm"
                              onClick={() => handlePayCommission(commission.id)}
                            >
                              Mark as Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Expense Tracking</CardTitle>
                    <p className="text-sm text-muted-foreground">Record operational expenses</p>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Record Expense
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Record Expense</DialogTitle>
                        <DialogDescription>
                          Record a new operational expense
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="expenseDate">Date *</Label>
                          <Input
                            id="expenseDate"
                            type="date"
                            value={expenseDate}
                            onChange={(e) => setExpenseDate(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="category">Category *</Label>
                          <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Printing Materials">Printing Materials</SelectItem>
                              <SelectItem value="Ink">Ink</SelectItem>
                              <SelectItem value="Paper">Paper</SelectItem>
                              <SelectItem value="Machine Maintenance">Machine Maintenance</SelectItem>
                              <SelectItem value="Utilities">Utilities</SelectItem>
                              <SelectItem value="Rent">Rent</SelectItem>
                              <SelectItem value="Salaries">Salaries</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="description">Description *</Label>
                          <Textarea
                            id="description"
                            value={expenseDescription}
                            onChange={(e) => setExpenseDescription(e.target.value)}
                            placeholder="Describe the expense"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expenseAmount">Amount *</Label>
                          <Input
                            id="expenseAmount"
                            type="number"
                            step="0.01"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expenseMethod">Payment Method *</Label>
                          <Select value={expensePaymentMethod} onValueChange={setExpensePaymentMethod}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="mobile_money">Mobile Money</SelectItem>
                              <SelectItem value="cheque">Cheque</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="supplier">Supplier Name</Label>
                          <Input
                            id="supplier"
                            value={expenseSupplier}
                            onChange={(e) => setExpenseSupplier(e.target.value)}
                            placeholder="Supplier or vendor name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expenseNotes">Notes</Label>
                          <Textarea
                            id="expenseNotes"
                            value={expenseNotes}
                            onChange={(e) => setExpenseNotes(e.target.value)}
                            placeholder="Additional notes"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleRecordExpense}>Record Expense</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{format(new Date(expense.expense_date), 'PP')}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.category}</Badge>
                        </TableCell>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>GH₵{expense.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {expense.payment_method.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{expense.supplier_name || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              expense.approval_status === 'approved'
                                ? 'default'
                                : expense.approval_status === 'rejected'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {expense.approval_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Revenue:</span>
                      <span className="font-semibold">GH₵{stats.totalRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount Collected:</span>
                      <span className="font-semibold text-green-600">GH₵{stats.collectedAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outstanding:</span>
                      <span className="font-semibold text-orange-600">GH₵{stats.outstandingAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Expenses:</span>
                      <span className="font-semibold text-red-600">GH₵{stats.totalExpenses.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-semibold">Net Profit:</span>
                      <span className={`font-bold ${stats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        GH₵{stats.profit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Commission Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pending Commissions:</span>
                      <span className="font-semibold text-orange-600">GH₵{stats.pendingCommissions.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid Commissions:</span>
                      <span className="font-semibold text-green-600">GH₵{stats.paidCommissions.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-semibold">Total Commissions:</span>
                      <span className="font-bold">GH₵{(stats.pendingCommissions + stats.paidCommissions).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Button variant="outline" className="justify-start">
                    <Calendar className="mr-2 h-4 w-4" />
                    Generate Monthly Report
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Receipt className="mr-2 h-4 w-4" />
                    Export Transactions
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Send Payment Reminders
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AccountantDashboard;