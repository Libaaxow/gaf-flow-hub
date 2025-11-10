import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Plus,
  FileText,
  Users,
  Calendar as CalendarIcon,
  Eye,
  Download,
  Filter
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
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, subYears, startOfYear, endOfYear } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FinancialStats {
  totalRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  totalExpenses: number;
  profit: number;
  pendingCommissions: number;
  paidCommissions: number;
  totalInvoices: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer: { name: string };
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
}

const AccountantDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<FinancialStats>({
    totalRevenue: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    totalExpenses: 0,
    profit: 0,
    pendingCommissions: 0,
    paidCommissions: 0,
    totalInvoices: 0,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRangePreset, setDateRangePreset] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');
  
  // Workflow states
  const [workflowOrders, setWorkflowOrders] = useState<any[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [selectedDesigner, setSelectedDesigner] = useState('');
  const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState('');
  
  // Payment form states
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  
  // Expense form states
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Customer form states
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');

  // Invoice form states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceSubtotal, setInvoiceSubtotal] = useState('');
  const [invoiceTax, setInvoiceTax] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceTerms, setInvoiceTerms] = useState('');

  // Report filter states
  const [reportType, setReportType] = useState('profit_loss');
  const [reportCustomer, setReportCustomer] = useState('all');

  // Dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<any>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<any>(null);

  useEffect(() => {
    fetchAllData();
    fetchWorkflowOrders();
    fetchDesigners();

    // Set up realtime subscription for orders
    const ordersChannel = supabase
      .channel('accountant-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchAllData();
          fetchWorkflowOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  useEffect(() => {
    fetchFinancialData();
  }, [startDate, endDate]);

  const fetchAllData = async () => {
    await Promise.all([
      fetchFinancialData(),
      fetchCustomers(),
      fetchInvoices(),
    ]);
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(name, email, phone),
          invoice_items(
            id,
            description,
            quantity,
            unit_price,
            amount
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
    }
  };

  const fetchFinancialData = async () => {
    try {
      setLoading(true);

      // Parse time and apply to dates
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      const startDateTime = new Date(startDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);
      
      const endDateTime = new Date(endDate);
      endDateTime.setHours(endHour, endMinute, 59, 999);

      const startDateFilter = startDateTime.toISOString();
      const endDateFilter = endDateTime.toISOString();
      
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
        .gte('created_at', startDateFilter)
        .lte('created_at', endDateFilter)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

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
        .gte('created_at', startDateFilter)
        .lte('created_at', endDateFilter)
        .order('created_at', { ascending: false });

      let enrichedCommissions: any[] = [];
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

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', startDateFilter)
        .lte('expense_date', endDateFilter)
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;

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
        .gte('payment_date', startDateFilter)
        .lte('payment_date', endDateFilter)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      setOrders(ordersData || []);
      setExpenses(expensesData || []);
      setPayments(paymentsData || []);

      const totalRevenue = ordersData?.reduce((sum, order) => sum + Number(order.order_value || 0), 0) || 0;
      const collectedAmount = ordersData?.reduce((sum, order) => sum + Number(order.amount_paid || 0), 0) || 0;
      const outstandingAmount = totalRevenue - collectedAmount;
      const totalExpenses = expensesData?.filter(e => e.approval_status === 'approved').reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || 0;
      const profit = collectedAmount - totalExpenses;
      const pendingCommissions = commissionsData?.filter(c => c.paid_status === 'unpaid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;
      const paidCommissions = commissionsData?.filter(c => c.paid_status === 'paid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;
      
      const { count: invoiceCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalRevenue,
        collectedAmount,
        outstandingAmount,
        totalExpenses,
        profit,
        pendingCommissions,
        paidCommissions,
        totalInvoices: invoiceCount || 0,
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

  const fetchDesigners = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'designer');
      
      if (data && data.length > 0) {
        const designerIds = data.map(d => d.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', designerIds);
        
        setDesigners(profiles || []);
      }
    } catch (error) {
      console.error('Error fetching designers:', error);
    }
  };

  const fetchWorkflowOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name, email, phone),
          invoices:invoices!order_id (id)
        `)
        .in('status', ['pending_accounting_review', 'awaiting_accounting_approval', 'ready_for_collection'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enrichedOrders = await Promise.all(
        (ordersData || []).map(async (order) => {
          let salesperson = null;
          let designer = null;

          if (order.salesperson_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.salesperson_id)
              .single();
            salesperson = data;
          }

          if (order.designer_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', order.designer_id)
              .single();
            designer = data;
          }

          const invoice_count = Array.isArray((order as any).invoices) ? (order as any).invoices.length : 0;
          return { ...order, salesperson, designer, invoice_count };
        })
      );

      setWorkflowOrders(enrichedOrders);
    } catch (error: any) {
      console.error('Error fetching workflow orders:', error);
    }
  };

  const handleAssignDesigner = async () => {
    if (!selectedOrderForAssignment || !selectedDesigner) {
      toast({
        title: 'Error',
        description: 'Please select both an order and a designer',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Check if invoice exists for this order
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', selectedOrderForAssignment)
        .limit(1);

      if (invoiceError) throw invoiceError;

      if (!invoiceData || invoiceData.length === 0) {
        toast({
          title: 'Invoice Required',
          description: 'Please create an invoice for this order before assigning a designer',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ 
          designer_id: selectedDesigner,
          status: 'designing'
        })
        .eq('id', selectedOrderForAssignment);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order assigned to designer successfully',
      });

      setSelectedOrderForAssignment('');
      setSelectedDesigner('');
      fetchWorkflowOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleApproveAndSendToPrint = async (orderId: string) => {
    try {
      // Check if there's a payment or if it's marked as debt
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('payment_status, order_value')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // If not paid, ask accountant to record payment or mark as debt
      if (orderData.payment_status === 'unpaid') {
        toast({
          title: 'Payment Required',
          description: 'Please record payment or mark this order as customer debt before sending to print',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: 'printing' })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order sent to print operator',
      });

      fetchWorkflowOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedOrder || !paymentAmount || !paymentMethod || !paymentReference) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields including receipt number',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      console.log('Recording payment:', { selectedOrder, paymentAmount, paymentMethod, paymentReference });

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

      if (paymentError) {
        console.error('Payment insert error:', paymentError);
        throw paymentError;
      }

      const order = orders.find(o => o.id === selectedOrder);
      if (order) {
        const newAmountPaid = Number(order.amount_paid || 0) + parseFloat(paymentAmount);
        const newPaymentStatus = newAmountPaid >= order.order_value ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

        console.log('Updating order payment status:', { newAmountPaid, newPaymentStatus });

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            amount_paid: newAmountPaid,
            payment_status: newPaymentStatus as 'unpaid' | 'partial' | 'paid',
            payment_method: paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
          })
          .eq('id', selectedOrder);

        if (updateError) {
          console.error('Order update error:', updateError);
          throw updateError;
        }

        // Update associated invoice if exists
        const { data: orderInvoices, error: invoiceFetchError } = await supabase
          .from('invoices')
          .select('*')
          .eq('order_id', selectedOrder);

        console.log('Checking for invoices:', { orderId: selectedOrder, invoicesFound: orderInvoices?.length });

        if (invoiceFetchError) {
          console.error('Error fetching invoices:', invoiceFetchError);
        }

        if (orderInvoices && orderInvoices.length > 0) {
          const invoice = orderInvoices[0];
          const invoiceNewAmountPaid = Number(invoice.amount_paid || 0) + parseFloat(paymentAmount);
          const invoiceTotal = Number(invoice.total_amount);
          
          // Determine invoice status based on payment
          let invoiceStatus = 'draft';
          if (invoiceNewAmountPaid >= invoiceTotal) {
            invoiceStatus = 'paid';
          } else if (invoiceNewAmountPaid > 0) {
            invoiceStatus = 'partially_paid';
          } else if (invoice.status === 'sent') {
            invoiceStatus = 'sent';
          }

          console.log('Updating invoice:', { 
            invoiceId: invoice.id, 
            currentAmountPaid: invoice.amount_paid,
            paymentAmount: parseFloat(paymentAmount),
            invoiceNewAmountPaid, 
            invoiceTotal,
            newStatus: invoiceStatus,
            oldStatus: invoice.status
          });

          const { error: invoiceUpdateError } = await supabase
            .from('invoices')
            .update({
              amount_paid: invoiceNewAmountPaid,
              status: invoiceStatus,
            })
            .eq('id', invoice.id);

          if (invoiceUpdateError) {
            console.error('Invoice update error:', invoiceUpdateError);
            toast({
              title: 'Warning',
              description: 'Payment recorded but invoice status may not be updated. Check permissions.',
              variant: 'destructive',
            });
          } else {
            console.log('Invoice updated successfully');
          }
        } else {
          console.log('No invoice found for this order');
        }
      }

      toast({
        title: 'Success',
        description: 'Payment recorded successfully',
      });

      // Reset form and close dialog
      setSelectedOrder('');
      setPaymentAmount('');
      setPaymentMethod('');
      setPaymentReference('');
      setPaymentNotes('');
      setPaymentDialogOpen(false);
      
      fetchFinancialData();
      fetchWorkflowOrders();
      fetchInvoices(); // Refresh invoices to show updated status
    } catch (error: any) {
      console.error('Payment recording error:', error);
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
          approval_status: 'approved',
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Expense recorded successfully',
      });

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
      fetchWorkflowOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCreateCustomer = async () => {
    if (!customerName || !customerEmail) {
      toast({
        title: 'Missing Information',
        description: 'Please provide at least name and email',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('customers')
        .insert([{
          name: customerName,
          email: customerEmail,
          phone: customerPhone || null,
          company_name: customerCompany || null,
          created_by: user?.id,
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer created successfully',
      });

      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCreateInvoice = async () => {
    if (!invoiceNumber || !invoiceCustomer || !invoiceSubtotal) {
      toast({
        title: 'Missing Information',
        description: 'Please provide invoice number, customer and subtotal',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const subtotal = parseFloat(invoiceSubtotal);
      const tax = invoiceTax ? parseFloat(invoiceTax) : 0;
      const total = subtotal + tax;

      const { error } = await supabase
        .from('invoices')
        .insert([{
          invoice_number: invoiceNumber,
          customer_id: invoiceCustomer,
          order_id: invoiceOrder || null,
          due_date: invoiceDueDate || null,
          subtotal: subtotal,
          tax_amount: tax,
          total_amount: total,
          notes: invoiceNotes || null,
          terms: invoiceTerms || null,
          created_by: user?.id,
          status: 'draft',
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Invoice ${invoiceNumber} created successfully`,
      });

      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceSubtotal('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceTerms('');
      
      fetchInvoices();
      fetchFinancialData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDateRangePreset = (preset: string) => {
    setDateRangePreset(preset);
    const now = new Date();
    
    switch (preset) {
      case 'today':
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'last_7_days':
        setStartDate(startOfDay(subDays(now, 7)));
        setEndDate(endOfDay(now));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'last_30_days':
        setStartDate(startOfDay(subDays(now, 30)));
        setEndDate(endOfDay(now));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'this_month':
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        setStartDate(startOfMonth(lastMonth));
        setEndDate(endOfMonth(lastMonth));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'this_year':
        setStartDate(startOfYear(now));
        setEndDate(endOfYear(now));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'last_year':
        const lastYear = subYears(now, 1);
        setStartDate(startOfYear(lastYear));
        setEndDate(endOfYear(lastYear));
        setStartTime('00:00');
        setEndTime('23:59');
        break;
      case 'custom':
        // Keep current dates for custom selection
        break;
    }
  };

  const generateReport = () => {
    // This would generate PDF or export data based on selected filters
    toast({
      title: 'Report Generated',
      description: `${reportType} report for ${reportCustomer === 'all' ? 'all customers' : 'selected customer'}`,
    });
  };

  const statCards = [
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      description: 'Total order value',
      color: 'text-blue-600',
    },
    {
      title: 'Amount Collected',
      value: `$${stats.collectedAmount.toFixed(2)}`,
      icon: TrendingUp,
      description: 'Payments received',
      color: 'text-green-600',
    },
    {
      title: 'Outstanding',
      value: `$${stats.outstandingAmount.toFixed(2)}`,
      icon: Clock,
      description: 'Pending payments',
      color: 'text-orange-600',
    },
    {
      title: 'Total Expenses',
      value: `$${stats.totalExpenses.toFixed(2)}`,
      icon: TrendingDown,
      description: 'Operational costs',
      color: 'text-red-600',
    },
    {
      title: 'Net Profit',
      value: `$${stats.profit.toFixed(2)}`,
      icon: DollarSign,
      description: 'Revenue - Expenses',
      color: stats.profit >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Total Invoices',
      value: stats.totalInvoices,
      icon: FileText,
      description: 'Invoices created',
      color: 'text-purple-600',
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
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 w-full max-w-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Accountant Dashboard</h1>
              <p className="text-sm sm:text-base text-muted-foreground">Financial management and reporting</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "MMM d")} {startTime} - {format(endDate, "MMM d, yyyy")} {endTime}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 space-y-4">
                    <div>
                      <div className="font-semibold text-sm mb-2">Select Date Range</div>
                      <div className="flex gap-2">
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">Start Date</div>
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={(date) => {
                              if (date) {
                                setStartDate(date);
                                setDateRangePreset('custom');
                              }
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                          <div className="px-3">
                            <Label htmlFor="start-time" className="text-xs">Start Time</Label>
                            <Input
                              id="start-time"
                              type="time"
                              value={startTime}
                              onChange={(e) => {
                                setStartTime(e.target.value);
                                setDateRangePreset('custom');
                              }}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="border-l mx-2" />
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">End Date</div>
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={(date) => {
                              if (date) {
                                setEndDate(date);
                                setDateRangePreset('custom');
                              }
                            }}
                            disabled={(date) => date < startDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                          <div className="px-3">
                            <Label htmlFor="end-time" className="text-xs">End Time</Label>
                            <Input
                              id="end-time"
                              type="time"
                              value={endTime}
                              onChange={(e) => {
                                setEndTime(e.target.value);
                                setDateRangePreset('custom');
                              }}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {/* Quick Date Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dateRangePreset === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('today')}
            >
              Today
            </Button>
            <Button
              variant={dateRangePreset === 'last_7_days' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('last_7_days')}
            >
              Last 7 Days
            </Button>
            <Button
              variant={dateRangePreset === 'last_30_days' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('last_30_days')}
            >
              Last 30 Days
            </Button>
            <Button
              variant={dateRangePreset === 'this_month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('this_month')}
            >
              This Month
            </Button>
            <Button
              variant={dateRangePreset === 'last_month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('last_month')}
            >
              Last Month
            </Button>
            <Button
              variant={dateRangePreset === 'this_year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('this_year')}
            >
              This Year
            </Button>
            <Button
              variant={dateRangePreset === 'last_year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangePreset('last_year')}
            >
              Last Year
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.title} className="mobile-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
                <CardTitle className="text-xs sm:text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                <div className={`text-xl sm:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="workflow" className="space-y-3 sm:space-y-4">
          <div className="overflow-x-auto custom-scrollbar">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 min-w-max sm:min-w-0">
              <TabsTrigger value="workflow" className="text-xs sm:text-sm whitespace-nowrap">Workflow</TabsTrigger>
              <TabsTrigger value="invoices" className="text-xs sm:text-sm whitespace-nowrap">Invoices</TabsTrigger>
              <TabsTrigger value="customers" className="text-xs sm:text-sm whitespace-nowrap">Customers</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs sm:text-sm whitespace-nowrap">Payments</TabsTrigger>
              <TabsTrigger value="expenses" className="text-xs sm:text-sm whitespace-nowrap">Expenses</TabsTrigger>
              <TabsTrigger value="commissions" className="text-xs sm:text-sm whitespace-nowrap">Commissions</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs sm:text-sm whitespace-nowrap">Reports</TabsTrigger>
            </TabsList>
          </div>

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Orders Pending Assignment</CardTitle>
                <CardDescription className="text-xs sm:text-sm">New orders from sales team awaiting designer assignment</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto custom-scrollbar">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Job Title</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[150px]">Salesperson</TableHead>
                      <TableHead className="min-w-[100px]">Order Value</TableHead>
                      <TableHead className="min-w-[100px]">Invoice Status</TableHead>
                      <TableHead className="min-w-[100px]">Created</TableHead>
                      <TableHead className="min-w-[200px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflowOrders.filter(o => o.status === 'pending_accounting_review').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No pending orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      workflowOrders.filter(o => o.status === 'pending_accounting_review').map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.job_title}</TableCell>
                          <TableCell>{order.customers?.name}</TableCell>
                          <TableCell>{order.salesperson?.full_name || '-'}</TableCell>
                          <TableCell>${order.order_value?.toFixed(2)}</TableCell>
                          <TableCell>
                            {order.invoice_count > 0 ? (
                              <Badge variant="default">Invoice Created</Badge>
                            ) : (
                              <Badge variant="secondary">No Invoice</Badge>
                            )}
                          </TableCell>
                          <TableCell>{format(new Date(order.created_at), 'PP')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {order.invoice_count > 0 ? (
                                <Button 
                                  size="sm" 
                                  variant="secondary"
                                  disabled
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Invoice Created
                                </Button>
                              ) : (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => {
                                        setInvoiceOrder(order.id);
                                        setInvoiceCustomer(order.customer_id);
                                        setInvoiceSubtotal(order.order_value?.toString() || '');
                                      }}
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Create Invoice
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
                                    <DialogHeader>
                                      <DialogTitle>Create Invoice</DialogTitle>
                                      <DialogDescription>Create a new invoice for this order</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4 overflow-y-auto max-h-[60vh]">
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-invoice-number">Invoice Number *</Label>
                                        <Input
                                          id="workflow-invoice-number"
                                          value={invoiceNumber}
                                          onChange={(e) => setInvoiceNumber(e.target.value)}
                                          placeholder="INV-00001"
                                        />
                                      </div>
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-invoice-customer">Customer *</Label>
                                        <Select value={invoiceCustomer} onValueChange={setInvoiceCustomer}>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select customer" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {customers.map((customer) => (
                                              <SelectItem key={customer.id} value={customer.id}>
                                                {customer.name} - {customer.company_name || 'No Company'}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                          <Label htmlFor="workflow-subtotal">Subtotal *</Label>
                                          <Input
                                            id="workflow-subtotal"
                                            type="number"
                                            step="0.01"
                                            value={invoiceSubtotal}
                                            onChange={(e) => setInvoiceSubtotal(e.target.value)}
                                            placeholder="0.00"
                                          />
                                        </div>
                                        <div className="grid gap-2">
                                          <Label htmlFor="workflow-tax">Tax Amount</Label>
                                          <Input
                                            id="workflow-tax"
                                            type="number"
                                            step="0.01"
                                            value={invoiceTax}
                                            onChange={(e) => setInvoiceTax(e.target.value)}
                                            placeholder="0.00"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-due-date">Due Date</Label>
                                        <Input
                                          id="workflow-due-date"
                                          type="date"
                                          value={invoiceDueDate}
                                          onChange={(e) => setInvoiceDueDate(e.target.value)}
                                        />
                                      </div>
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-invoice-terms">Payment Terms</Label>
                                        <Textarea
                                          id="workflow-invoice-terms"
                                          value={invoiceTerms}
                                          onChange={(e) => setInvoiceTerms(e.target.value)}
                                          placeholder="Net 30 days"
                                        />
                                      </div>
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-invoice-notes">Notes</Label>
                                        <Textarea
                                          id="workflow-invoice-notes"
                                          value={invoiceNotes}
                                          onChange={(e) => setInvoiceNotes(e.target.value)}
                                          placeholder="Additional notes"
                                        />
                                      </div>
                                    </div>
                                    <DialogFooter>
                                      <Button onClick={handleCreateInvoice}>Create Invoice</Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              )}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" onClick={() => setSelectedOrderForAssignment(order.id)}>
                                    Assign Designer
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Assign Designer</DialogTitle>
                                    <DialogDescription>
                                      Select a designer for: {order.job_title}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                      <Label htmlFor="designer">Designer *</Label>
                                      <Select value={selectedDesigner} onValueChange={setSelectedDesigner}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select designer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {designers.map((designer) => (
                                            <SelectItem key={designer.id} value={designer.id}>
                                              {designer.full_name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button onClick={handleAssignDesigner}>Assign</Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrderForInvoice(order);
                                  setInvoiceDialogOpen(true);
                                }}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Invoice
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Orders Awaiting Approval</CardTitle>
                <CardDescription>Completed designs awaiting your approval</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Job Title</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[150px]">Designer</TableHead>
                      <TableHead className="min-w-[100px]">Order Value</TableHead>
                      <TableHead className="min-w-[120px]">Payment Status</TableHead>
                      <TableHead className="min-w-[100px]">Completed</TableHead>
                      <TableHead className="min-w-[250px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflowOrders.filter(o => o.status === 'awaiting_accounting_approval').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No orders awaiting approval
                        </TableCell>
                      </TableRow>
                    ) : (
                      workflowOrders.filter(o => o.status === 'awaiting_accounting_approval').map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.job_title}</TableCell>
                          <TableCell>{order.customers?.name}</TableCell>
                          <TableCell>{order.designer?.full_name || '-'}</TableCell>
                          <TableCell>${order.order_value?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              order.payment_status === 'paid' ? 'default' :
                              order.payment_status === 'partial' ? 'secondary' :
                              'destructive'
                            }>
                              {order.payment_status || 'unpaid'}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(order.updated_at), 'PP')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {order.payment_status === 'unpaid' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedOrder(order.id);
                                    setPaymentDialogOpen(true);
                                  }}
                                >
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Record Payment
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                onClick={() => handleApproveAndSendToPrint(order.id)}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Send to Print
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedOrderForInvoice(order);
                                  setInvoiceDialogOpen(true);
                                }}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Invoice
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Orders Ready for Collection</CardTitle>
                <CardDescription>Printed orders waiting for customer pickup - Mark as completed when collected</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Job Title</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[150px]">Designer</TableHead>
                      <TableHead className="min-w-[100px]">Order Value</TableHead>
                      <TableHead className="min-w-[120px]">Payment Status</TableHead>
                      <TableHead className="min-w-[100px]">Ready Since</TableHead>
                      <TableHead className="min-w-[180px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workflowOrders.filter(o => o.status === 'ready_for_collection').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No orders ready for collection
                        </TableCell>
                      </TableRow>
                    ) : (
                      workflowOrders.filter(o => o.status === 'ready_for_collection').map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.job_title}</TableCell>
                          <TableCell>{order.customers?.name}</TableCell>
                          <TableCell>{order.designer?.full_name || '-'}</TableCell>
                          <TableCell>${order.order_value?.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              order.payment_status === 'paid' ? 'default' : 
                              order.payment_status === 'partial' ? 'secondary' : 
                              'destructive'
                            }>
                              {order.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(order.updated_at), 'PP')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={async () => {
                                  try {
                                    const { error } = await supabase
                                      .from('orders')
                                      .update({ status: 'completed' })
                                      .eq('id', order.id);

                                    if (error) throw error;

                                    toast({
                                      title: 'Success',
                                      description: 'Order marked as completed - Customer has collected',
                                    });

                                    fetchWorkflowOrders();
                                  } catch (error: any) {
                                    toast({
                                      title: 'Error',
                                      description: error.message,
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Mark Collected
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Invoices</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Manage customer invoices</CardDescription>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="w-full sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Invoice
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>Create Invoice</DialogTitle>
                        <DialogDescription>Create a new invoice for a customer</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 overflow-y-auto max-h-[60vh]">
                        <div className="grid gap-2">
                          <Label htmlFor="invoice-number">Invoice Number *</Label>
                          <Input
                            id="invoice-number"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            placeholder="INV-00001"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invoice-customer">Customer *</Label>
                          <Select value={invoiceCustomer} onValueChange={setInvoiceCustomer}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                              {customers.map((customer) => (
                                <SelectItem key={customer.id} value={customer.id}>
                                  {customer.name} - {customer.company_name || 'No Company'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invoice-order">Related Order (Optional)</Label>
                          <Select value={invoiceOrder} onValueChange={setInvoiceOrder}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select order" />
                            </SelectTrigger>
                            <SelectContent>
                              {orders.map((order) => (
                                <SelectItem key={order.id} value={order.id}>
                                  {order.job_title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="subtotal">Subtotal *</Label>
                            <Input
                              id="subtotal"
                              type="number"
                              step="0.01"
                              value={invoiceSubtotal}
                              onChange={(e) => setInvoiceSubtotal(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="tax">Tax Amount</Label>
                            <Input
                              id="tax"
                              type="number"
                              step="0.01"
                              value={invoiceTax}
                              onChange={(e) => setInvoiceTax(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="due-date">Due Date</Label>
                          <Input
                            id="due-date"
                            type="date"
                            value={invoiceDueDate}
                            onChange={(e) => setInvoiceDueDate(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invoice-terms">Payment Terms</Label>
                          <Textarea
                            id="invoice-terms"
                            value={invoiceTerms}
                            onChange={(e) => setInvoiceTerms(e.target.value)}
                            placeholder="Net 30 days"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invoice-notes">Notes</Label>
                          <Textarea
                            id="invoice-notes"
                            value={invoiceNotes}
                            onChange={(e) => setInvoiceNotes(e.target.value)}
                            placeholder="Additional notes"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateInvoice}>Create Invoice</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Invoice #</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[100px]">Due Date</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[80px]">Paid</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                          <TableCell>{invoice.customer.name}</TableCell>
                          <TableCell>{format(new Date(invoice.invoice_date), 'PP')}</TableCell>
                          <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'PP') : '-'}</TableCell>
                          <TableCell>${invoice.total_amount.toFixed(2)}</TableCell>
                          <TableCell>${invoice.amount_paid.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              invoice.status === 'paid' ? 'default' :
                              invoice.status === 'partially_paid' ? 'secondary' :
                              invoice.status === 'overdue' ? 'destructive' :
                              'outline'
                            }>
                              {invoice.status === 'partially_paid' ? 'Partially Paid' : invoice.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedInvoiceForView(invoice);
                                setInvoiceDialogOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Customers</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Manage customer database</CardDescription>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="w-full sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Customer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Add New Customer</DialogTitle>
                        <DialogDescription>Create a new customer record</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="customer-name">Name *</Label>
                          <Input
                            id="customer-name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Customer name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="customer-email">Email *</Label>
                          <Input
                            id="customer-email"
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            placeholder="customer@example.com"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="customer-phone">Phone</Label>
                          <Input
                            id="customer-phone"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="+1234567890"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="customer-company">Company Name</Label>
                          <Input
                            id="customer-company"
                            value={customerCompany}
                            onChange={(e) => setCustomerCompany(e.target.value)}
                            placeholder="Company name"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateCustomer}>Add Customer</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Name</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="min-w-[130px]">Phone</TableHead>
                      <TableHead className="min-w-[150px]">Company</TableHead>
                      <TableHead className="min-w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No customers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.email}</TableCell>
                          <TableCell>{customer.phone || '-'}</TableCell>
                          <TableCell>{customer.company_name || '-'}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6 relative z-20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Payment Management</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Record and track customer payments</CardDescription>
                  </div>
                  <Button 
                    onClick={() => {
                      console.log('Opening payment dialog');
                      setPaymentDialogOpen(true);
                    }}
                    size="sm"
                    className="w-full sm:w-auto shrink-0 relative z-30"
                    type="button"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0 relative z-10">
                <div className="overflow-x-auto custom-scrollbar">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[150px]">Order</TableHead>
                        <TableHead className="min-w-[150px]">Customer</TableHead>
                        <TableHead className="min-w-[100px]">Amount</TableHead>
                        <TableHead className="min-w-[120px]">Method</TableHead>
                        <TableHead className="min-w-[120px]">Receipt #</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      ) : (
                        payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>{format(new Date(payment.payment_date), 'PP')}</TableCell>
                            <TableCell>{payment.order.job_title}</TableCell>
                            <TableCell>{payment.order.customer.name}</TableCell>
                            <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                            <TableCell className="capitalize">{payment.payment_method.replace('_', ' ')}</TableCell>
                            <TableCell>{payment.reference_number || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Dialog - Separate from tab content */}
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>Record a new payment for an order</DialogDescription>
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
                          {order.job_title} - {order.customer.name} (Outstanding: ${(order.order_value - order.amount_paid).toFixed(2)})
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
                  <Label htmlFor="reference">Receipt Number *</Label>
                  <Input
                    id="reference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="RCP-00001"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-notes">Notes</Label>
                  <Textarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Additional payment notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleRecordPayment}>Record Payment</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Expense Management</CardTitle>
                    <CardDescription>Record and track business expenses</CardDescription>
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
                        <DialogDescription>Record a new business expense</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="expense-date">Date *</Label>
                          <Input
                            id="expense-date"
                            type="date"
                            value={expenseDate}
                            onChange={(e) => setExpenseDate(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-category">Category *</Label>
                          <Input
                            id="expense-category"
                            value={expenseCategory}
                            onChange={(e) => setExpenseCategory(e.target.value)}
                            placeholder="Supplies, Rent, Utilities, etc."
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-description">Description *</Label>
                          <Input
                            id="expense-description"
                            value={expenseDescription}
                            onChange={(e) => setExpenseDescription(e.target.value)}
                            placeholder="Brief description"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-amount">Amount *</Label>
                          <Input
                            id="expense-amount"
                            type="number"
                            step="0.01"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-method">Payment Method *</Label>
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
                          <Label htmlFor="expense-supplier">Supplier Name</Label>
                          <Input
                            id="expense-supplier"
                            value={expenseSupplier}
                            onChange={(e) => setExpenseSupplier(e.target.value)}
                            placeholder="Supplier name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-notes">Notes</Label>
                          <Textarea
                            id="expense-notes"
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
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[120px]">Category</TableHead>
                      <TableHead className="min-w-[180px]">Description</TableHead>
                      <TableHead className="min-w-[150px]">Supplier</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[120px]">Method</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No expenses recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{format(new Date(expense.expense_date), 'PP')}</TableCell>
                          <TableCell>{expense.category}</TableCell>
                          <TableCell>{expense.description}</TableCell>
                          <TableCell>{expense.supplier_name || '-'}</TableCell>
                          <TableCell className="font-medium">${expense.amount.toFixed(2)}</TableCell>
                          <TableCell className="capitalize">{expense.payment_method.replace('_', ' ')}</TableCell>
                          <TableCell>
                            <Badge variant={expense.approval_status === 'approved' ? 'default' : 'secondary'}>
                              {expense.approval_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Commission Management</CardTitle>
                <CardDescription>Track and pay sales commissions</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Salesperson</TableHead>
                      <TableHead className="min-w-[150px]">Order</TableHead>
                      <TableHead className="min-w-[100px]">Percentage</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[130px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No commissions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      commissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell className="font-medium">{commission.salesperson.full_name}</TableCell>
                          <TableCell>{commission.order.job_title}</TableCell>
                          <TableCell>{commission.commission_percentage}%</TableCell>
                          <TableCell className="font-medium">${commission.commission_amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={commission.paid_status === 'paid' ? 'default' : 'secondary'}>
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
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Advanced Reports</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Generate detailed financial reports with filters</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Report Type</Label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select report type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="profit_loss">Profit & Loss Statement</SelectItem>
                        <SelectItem value="customer_report">Customer Report</SelectItem>
                        <SelectItem value="payments_received">Payments Received</SelectItem>
                        <SelectItem value="expenses_report">Expenses Report</SelectItem>
                        <SelectItem value="commissions_report">Commissions Report</SelectItem>
                        <SelectItem value="invoice_summary">Invoice Summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={(date) => date && setStartDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid gap-2">
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={endDate}
                            onSelect={(date) => date && setEndDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Filter by Customer</Label>
                    <Select value={reportCustomer} onValueChange={setReportCustomer}>
                      <SelectTrigger>
                        <SelectValue placeholder="All customers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={generateReport} className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Generate Report
                  </Button>
                </div>

                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-base sm:text-lg font-semibold">Report Summary</h3>
                  <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                    <Card className="mobile-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">From all orders</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600">${stats.totalExpenses.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Approved expenses</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${stats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${stats.profit.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-600">${stats.outstandingAmount.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Pending payments</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                          ${(stats.pendingCommissions + stats.paidCommissions).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pending: ${stats.pendingCommissions.toFixed(2)} | Paid: ${stats.paidCommissions.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{stats.totalInvoices}</div>
                        <p className="text-xs text-muted-foreground">All invoices created</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Detailed Reports Section */}
                <div className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 border-t">
                  <h3 className="text-base sm:text-lg font-semibold">Detailed Reports</h3>

                  {/* Commissions Report */}
                  <Card className="mobile-card">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg">Commissions Report</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">All commissions within the selected date range</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 sm:pt-0">
                      <div className="overflow-x-auto custom-scrollbar">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">Salesperson</TableHead>
                            <TableHead className="min-w-[200px]">Order</TableHead>
                            <TableHead className="min-w-[100px]">Percentage</TableHead>
                            <TableHead className="min-w-[120px]">Amount</TableHead>
                            <TableHead className="min-w-[100px]">Status</TableHead>
                            <TableHead className="min-w-[130px]">Created Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commissions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No commissions found for the selected period
                              </TableCell>
                            </TableRow>
                          ) : (
                            commissions.map((commission) => (
                              <TableRow key={commission.id}>
                                <TableCell className="font-medium">{commission.salesperson.full_name}</TableCell>
                                <TableCell>{commission.order.job_title}</TableCell>
                                <TableCell>{commission.commission_percentage}%</TableCell>
                                <TableCell className="font-medium">${commission.commission_amount.toFixed(2)}</TableCell>
                                <TableCell>
                                  <Badge variant={commission.paid_status === 'paid' ? 'default' : 'secondary'}>
                                    {commission.paid_status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{format(new Date(commission.created_at), 'PPp')}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expenses Report */}
                  <Card className="mobile-card">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg">Expenses Report</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">All expenses within the selected date range</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 sm:pt-0">
                      <div className="overflow-x-auto custom-scrollbar">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[130px]">Date</TableHead>
                            <TableHead className="min-w-[150px]">Category</TableHead>
                            <TableHead className="min-w-[200px]">Description</TableHead>
                            <TableHead className="min-w-[120px]">Amount</TableHead>
                            <TableHead className="min-w-[150px]">Supplier</TableHead>
                            <TableHead className="min-w-[120px]">Payment Method</TableHead>
                            <TableHead className="min-w-[100px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expenses.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                No expenses found for the selected period
                              </TableCell>
                            </TableRow>
                          ) : (
                            expenses.map((expense) => (
                              <TableRow key={expense.id}>
                                <TableCell>{format(new Date(expense.expense_date), 'PP')}</TableCell>
                                <TableCell className="font-medium">{expense.category}</TableCell>
                                <TableCell>{expense.description}</TableCell>
                                <TableCell className="font-medium">${expense.amount.toFixed(2)}</TableCell>
                                <TableCell>{expense.supplier_name || '-'}</TableCell>
                                <TableCell className="capitalize">{expense.payment_method}</TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      expense.approval_status === 'approved' ? 'default' :
                                      expense.approval_status === 'rejected' ? 'destructive' :
                                      'secondary'
                                    }
                                  >
                                    {expense.approval_status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payments Report */}
                  <Card className="mobile-card">
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg">Payments Report</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">All payments received within the selected date range</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 sm:pt-0">
                      <div className="overflow-x-auto custom-scrollbar">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[130px]">Payment Date</TableHead>
                            <TableHead className="min-w-[150px]">Customer</TableHead>
                            <TableHead className="min-w-[200px]">Order</TableHead>
                            <TableHead className="min-w-[120px]">Amount</TableHead>
                            <TableHead className="min-w-[120px]">Payment Method</TableHead>
                            <TableHead className="min-w-[150px]">Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No payments found for the selected period
                              </TableCell>
                            </TableRow>
                          ) : (
                            payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell>{format(new Date(payment.payment_date), 'PPp')}</TableCell>
                                <TableCell className="font-medium">
                                  {payment.order?.customer?.name || '-'}
                                </TableCell>
                                <TableCell>{payment.order?.job_title || '-'}</TableCell>
                                <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                                <TableCell className="capitalize">{payment.payment_method}</TableCell>
                                <TableCell>{payment.reference_number || '-'}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Invoice Dialog */}
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        order={selectedOrderForInvoice || selectedInvoiceForView}
      />
    </Layout>
  );
};

export default AccountantDashboard;