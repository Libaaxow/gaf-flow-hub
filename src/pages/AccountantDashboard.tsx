import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { JobDetailsDialog } from '@/components/JobDetailsDialog';
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
  Filter,
  Pencil
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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
import { generatePaymentsReportPDF } from '@/utils/generatePaymentsReportPDF';
import { generateExpensesReportPDF } from '@/utils/generateExpensesReportPDF';
import { CommissionPanel } from '@/components/CommissionPanel';
import { OutstandingDebtsDialog } from '@/components/OutstandingDebtsDialog';

interface FinancialStats {
  totalRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  totalExpenses: number;
  profit: number;
  recognizedProfit: number;
  pendingProfit: number;
  totalProfit: number;
  pendingCommissions: number;
  paidCommissions: number;
  totalInvoices: number;
}

interface Product {
  id: string;
  name: string;
  product_code: string;
  retail_unit: string;
  selling_price: number;
  cost_per_retail_unit: number | null;
  stock_quantity: number;
  sale_type: string;
  selling_price_per_m2: number | null;
  cost_per_m2: number | null;
  total_roll_area: number | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer: { name: string; email?: string; phone?: string };
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  order_id?: string;
  is_draft?: boolean;
  invoice_items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  subtotal?: number;
  tax_amount?: number;
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
    recognizedProfit: 0,
    pendingProfit: 0,
    totalProfit: 0,
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
  const [salesRequests, setSalesRequests] = useState<any[]>([]);
  const [viewSalesRequest, setViewSalesRequest] = useState<any | null>(null);
  const [requestFiles, setRequestFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRangePreset, setDateRangePreset] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');
  
  // Workflow states
  const [workflowOrders, setWorkflowOrders] = useState<any[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [printOperators, setPrintOperators] = useState<any[]>([]);
  const [selectedDesigner, setSelectedDesigner] = useState('');
  const [selectedPrintOperator, setSelectedPrintOperator] = useState('');
  const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState('');
  const [selectedOrderForPrintAssignment, setSelectedOrderForPrintAssignment] = useState('');
  
  // Payment form states
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentCustomer, setPaymentCustomer] = useState('');
  const [paymentInvoice, setPaymentInvoice] = useState('');
  const [paymentDiscount, setPaymentDiscount] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [paymentAllocation, setPaymentAllocation] = useState<{
    invoiceId: string, 
    amount: number, 
    selected: boolean,
    discountType: 'fixed' | 'percentage',
    discountValue: number,
    discountReason: string
  }[]>([]);
  
  // Expense form states
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('');
  const [expenseSupplier, setExpenseSupplier] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Expense filter states
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [expenseFilterMode, setExpenseFilterMode] = useState<'global' | 'custom' | 'all'>('global');
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseFilterCategory, setExpenseFilterCategory] = useState('all');
  const [expenseCustomStartDate, setExpenseCustomStartDate] = useState<Date>(subMonths(new Date(), 3));
  const [expenseCustomEndDate, setExpenseCustomEndDate] = useState<Date>(new Date());

  // Customer filter states
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Payment filter states
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [paymentFilterMode, setPaymentFilterMode] = useState<'global' | 'custom' | 'all'>('global');
  const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
  const [paymentFilterMethod, setPaymentFilterMethod] = useState('all');
  const [paymentCustomStartDate, setPaymentCustomStartDate] = useState<Date>(subMonths(new Date(), 3));
  const [paymentCustomEndDate, setPaymentCustomEndDate] = useState<Date>(new Date());

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');

  // Invoice form states
  const [invoiceFilterCustomer, setInvoiceFilterCustomer] = useState<string>('all');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTax, setInvoiceTax] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceTerms, setInvoiceTerms] = useState('');
  const [invoiceProjectName, setInvoiceProjectName] = useState('');

  // Invoice items state with area-based support
  interface InvoiceItem {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    product_id?: string;
    retail_unit?: string;
    cost_per_unit?: number;
    line_cost?: number;
    line_profit?: number;
    sale_type: string;
    width_m: number | null;
    height_m: number | null;
    area_m2: number | null;
  }
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }
  ]);
  const [products, setProducts] = useState<Product[]>([]);

  // Report filter states
  const [reportType, setReportType] = useState('profit_loss');
  const [reportCustomer, setReportCustomer] = useState('all');

  // Dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = useState(false);
  const [invoicePaymentDialogOpen, setInvoicePaymentDialogOpen] = useState(false);
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<any>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<any>(null);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [selectedOrderForDebt, setSelectedOrderForDebt] = useState<any>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editInvoiceDialogOpen, setEditInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [activatingDraftInvoice, setActivatingDraftInvoice] = useState<any>(null);
  const [assignNumberDialogOpen, setAssignNumberDialogOpen] = useState(false);
  const [outstandingDebtsDialogOpen, setOutstandingDebtsDialogOpen] = useState(false);
  
  // Invoice required dialog states
  const [invoiceRequiredDialogOpen, setInvoiceRequiredDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ requestId: string; newStatus: string; request: any } | null>(null);
  const [pendingSalesRequestLink, setPendingSalesRequestLink] = useState<{ requestId: string; newStatus: string } | null>(null);
  const [createCustomerForRequest, setCreateCustomerForRequest] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCompany, setNewCustomerCompany] = useState('');
  const [selectedCustomerForRequest, setSelectedCustomerForRequest] = useState('');
  const [linkExistingInvoice, setLinkExistingInvoice] = useState(false);
  const [selectedExistingInvoice, setSelectedExistingInvoice] = useState('');

  // Invoice payment form states
  const [invoicePaymentAmount, setInvoicePaymentAmount] = useState('');
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState('');
  const [invoicePaymentReference, setInvoicePaymentReference] = useState('');
  const [invoicePaymentNotes, setInvoicePaymentNotes] = useState('');
  const [invoicePaymentDiscountType, setInvoicePaymentDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [invoicePaymentDiscountValue, setInvoicePaymentDiscountValue] = useState('');
  const [invoicePaymentDiscountReason, setInvoicePaymentDiscountReason] = useState('');

  // Debt form states
  const [debtNotes, setDebtNotes] = useState('');

  // Debounce ref to prevent excessive refetches
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFetchAllData = useCallback(() => {
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }
    refetchTimeoutRef.current = setTimeout(() => {
      fetchAllData();
      fetchWorkflowOrders();
    }, 1000); // Debounce for 1 second
  }, []);

  useEffect(() => {
    fetchAllData();
    fetchWorkflowOrders();
    fetchDesigners();
    fetchPrintOperators();

    // Set up single realtime channel for all tables
    const channel = supabase
      .channel('accountant-all-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_requests' }, debouncedFetchAllData)
      .subscribe();

    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [debouncedFetchAllData]);

  useEffect(() => {
    fetchFilteredData();
  }, [startDate, endDate]);

  const fetchAllData = async () => {
    await Promise.all([
      fetchActualStats(),
      fetchFilteredData(),
      fetchCustomers(),
      fetchInvoices(),
      fetchProducts(),
      fetchSalesRequests(),
      fetchAllExpenses(),
      fetchAllPayments(),
    ]);
  };

  const fetchAllExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      setAllExpenses(data || []);
    } catch (error: any) {
      console.error('Error fetching all expenses:', error);
    }
  };

  const fetchAllPayments = async () => {
    try {
      const { data, error } = await supabase
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
          ),
          invoice:invoices(
            invoice_number,
            customer:customers(name)
          )
        `)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      setAllPayments(data || []);
    } catch (error: any) {
      console.error('Error fetching all payments:', error);
    }
  };

  const fetchSalesRequests = async () => {
    const { data, error } = await supabase
      .from('sales_order_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales requests:', error);
      return;
    }
    setSalesRequests(data || []);
  };

  const handleUpdateSalesRequestStatus = async (requestId: string, newStatus: string, request?: any) => {
    // Find the request if not provided
    const salesRequest = request || salesRequests.find(r => r.id === requestId);
    
    // If changing from pending to any other status, require invoice to be linked first
    if (salesRequest?.status === 'pending' && newStatus !== 'pending') {
      if (!salesRequest.linked_invoice_id) {
        // Show the invoice required dialog
        setPendingStatusChange({ requestId, newStatus, request: salesRequest });
        setInvoiceRequiredDialogOpen(true);
        // Pre-fill customer info from the request
        setNewCustomerName(salesRequest.customer_name || '');
        setNewCustomerEmail(salesRequest.customer_email || '');
        setNewCustomerPhone(salesRequest.customer_phone || '');
        setNewCustomerCompany(salesRequest.company_name || '');
        setSelectedCustomerForRequest('');
        setCreateCustomerForRequest(false);
        return;
      }
    }

    // When marking as collected, set status to completed
    const finalStatus = newStatus === 'collected' ? 'completed' : newStatus;
    
    const updateData: any = { 
      status: finalStatus,
      updated_at: new Date().toISOString()
    };
    
    if (newStatus === 'processed' || newStatus === 'in_design' || newStatus === 'in_print' || newStatus === 'printed' || newStatus === 'collected' || newStatus === 'completed') {
      updateData.processed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('sales_order_requests')
      .update(updateData)
      .eq('id', requestId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: `Request status updated to ${finalStatus.replace('_', ' ')}`,
    });
    fetchSalesRequests();
  };

  // Handle creating customer and opening invoice form for a sales request
  const handleCreateCustomerAndInvoiceForRequest = async () => {
    if (!pendingStatusChange) return;
    
    let customerId = selectedCustomerForRequest;
    
    // Create new customer if needed
    if (createCustomerForRequest || !selectedCustomerForRequest) {
      if (!newCustomerName.trim()) {
        toast({
          title: 'Error',
          description: 'Customer name is required',
          variant: 'destructive',
        });
        return;
      }
      
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: newCustomerName.trim(),
          email: newCustomerEmail.trim() || null,
          phone: newCustomerPhone.trim() || null,
          company_name: newCustomerCompany.trim() || null,
        })
        .select()
        .single();
      
      if (customerError) {
        toast({
          title: 'Error creating customer',
          description: customerError.message,
          variant: 'destructive',
        });
        return;
      }
      
      customerId = newCustomer.id;
      toast({
        title: 'Customer created',
        description: `Customer "${newCustomerName}" created successfully`,
      });
      
      // Refresh customers list
      fetchCustomers();
    }
    
    if (!customerId) {
      toast({
        title: 'Error',
        description: 'Please select or create a customer first',
        variant: 'destructive',
      });
      return;
    }
    
    // Generate invoice number
    const { data: invoiceNumberData } = await supabase.rpc('generate_invoice_number');
    const generatedInvoiceNumber = invoiceNumberData || `INV-${Date.now()}`;
    
    // Pre-fill invoice form
    setInvoiceNumber(generatedInvoiceNumber);
    setInvoiceCustomer(customerId);
    setInvoiceNotes(`Sales Request: ${pendingStatusChange.request.description?.substring(0, 200) || 'N/A'}`);
    setInvoiceItems([{ 
      description: pendingStatusChange.request.description || '', 
      quantity: 1, 
      unit_price: 0, 
      amount: 0, 
      sale_type: 'unit', 
      width_m: null, 
      height_m: null, 
      area_m2: null 
    }]);
    
    // Store pending request info to link after invoice creation
    setPendingSalesRequestLink({
      requestId: pendingStatusChange.requestId,
      newStatus: pendingStatusChange.newStatus
    });
    
    // Close the invoice required dialog
    setInvoiceRequiredDialogOpen(false);
    setPendingStatusChange(null);
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setNewCustomerCompany('');
    setSelectedCustomerForRequest('');
    setCreateCustomerForRequest(false);
    
    // Open the invoice creation dialog
    setCreateInvoiceDialogOpen(true);
  };

  // Handle linking an existing invoice to a sales request
  const handleLinkExistingInvoiceToRequest = async () => {
    if (!pendingStatusChange || !selectedExistingInvoice) return;
    
    try {
      // Link the invoice to the sales request
      const { error: linkError } = await supabase
        .from('sales_order_requests')
        .update({ linked_invoice_id: selectedExistingInvoice })
        .eq('id', pendingStatusChange.requestId);
      
      if (linkError) throw linkError;
      
      // Update the status
      const finalStatus = pendingStatusChange.newStatus === 'collected' ? 'completed' : pendingStatusChange.newStatus;
      
      const updateData: any = { 
        status: finalStatus,
        updated_at: new Date().toISOString()
      };
      
      if (['processed', 'in_design', 'in_print', 'printed', 'collected', 'completed'].includes(pendingStatusChange.newStatus)) {
        updateData.processed_at = new Date().toISOString();
      }

      const { error: statusError } = await supabase
        .from('sales_order_requests')
        .update(updateData)
        .eq('id', pendingStatusChange.requestId);

      if (statusError) throw statusError;
      
      toast({
        title: 'Success',
        description: `Invoice linked and status updated to ${finalStatus.replace('_', ' ')}`,
      });
      
      // Reset all states
      setInvoiceRequiredDialogOpen(false);
      setPendingStatusChange(null);
      setSelectedExistingInvoice('');
      setLinkExistingInvoice(false);
      setNewCustomerName('');
      setNewCustomerEmail('');
      setNewCustomerPhone('');
      setNewCustomerCompany('');
      setSelectedCustomerForRequest('');
      setCreateCustomerForRequest(false);
      
      fetchSalesRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAssignDesignerToRequest = async (requestId: string, designerId: string) => {
    const { error } = await supabase
      .from('sales_order_requests')
      .update({ 
        designer_id: designerId,
        status: 'in_design',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Designer assigned and status updated to In Design',
    });
    fetchSalesRequests();
    setViewSalesRequest(null);
  };

  const handleAssignPrintOperatorToRequest = async (requestId: string, printOperatorId: string) => {
    const { error } = await supabase
      .from('sales_order_requests')
      .update({ 
        print_operator_id: printOperatorId,
        status: 'in_print',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Print operator assigned and status updated to In Print',
    });
    fetchSalesRequests();
    setViewSalesRequest(null);
  };

  const fetchRequestFiles = async (requestId: string) => {
    try {
      const { data, error } = await supabase
        .from('request_files')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequestFiles(data || []);
    } catch (error) {
      console.error('Error fetching request files:', error);
      setRequestFiles([]);
    }
  };

  const handleDownloadRequestFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('request-files')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const getSalesRequestStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
      case 'processed':
        return <Badge className="bg-blue-500 text-white">Processed</Badge>;
      case 'in_design':
        return <Badge className="bg-purple-500 text-white">In Design</Badge>;
      case 'design_submitted':
        return <Badge className="bg-yellow-500 text-white">Design Submitted</Badge>;
      case 'in_print':
        return <Badge className="bg-orange-500 text-white">In Print</Badge>;
      case 'printed':
        return <Badge className="bg-teal-500 text-white">Printed</Badge>;
      case 'collected':
        return <Badge className="bg-success text-success-foreground">Collected</Badge>;
      case 'completed':
        return <Badge className="bg-success text-success-foreground">Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, product_code, retail_unit, selling_price, cost_per_retail_unit, stock_quantity, sale_type, selling_price_per_m2, cost_per_m2, total_roll_area')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      console.error('Error fetching products:', error);
    }
  };

  // Fetch actual total stats (not filtered by date)
  const fetchActualStats = async () => {
    try {
      // Get all orders for actual revenue calculation
      const { data: allOrdersData } = await supabase
        .from('orders')
        .select('order_value, amount_paid');

      // Get all invoices with their items for profit calculation
      const { data: allInvoices } = await supabase
        .from('invoices')
        .select(`
          id,
          total_amount, 
          amount_paid, 
          order_id, 
          is_draft, 
          status,
          invoice_items(line_profit)
        `);

      // Get all commissions
      const { data: allCommissions } = await supabase
        .from('commissions')
        .select('commission_amount, paid_status');

      // Get all approved expenses
      const { data: allExpenses } = await supabase
        .from('expenses')
        .select('amount, approval_status')
        .eq('approval_status', 'approved');

      // Fetch beginning balances
      const { data: beginningBalancesData } = await supabase
        .from('beginning_balances')
        .select('amount, account_type');

      // Calculate beginning balance total
      const beginningBalance = beginningBalancesData?.reduce((sum, b) => sum + Number(b.amount || 0), 0) || 0;

      // Calculate revenue from ALL invoices for total revenue
      const totalRevenue = allInvoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      const collectedAmount = allInvoices?.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0) || 0;
      
      // Outstanding Balance should only exclude true draft invoices (is_draft=true)
      const confirmedInvoices = allInvoices?.filter(inv => !inv.is_draft) || [];
      const confirmedRevenue = confirmedInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const confirmedCollected = confirmedInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
      const outstandingAmount = confirmedRevenue - confirmedCollected;
      
      const totalExpenses = allExpenses?.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) || 0;

      // Calculate profit recognition based on payment ratio
      // Recognized Profit = total_profit × (total_paid / invoice_total)
      // Pending Profit = total_profit - recognized_profit
      let totalProfit = 0;
      let recognizedProfit = 0;
      let pendingProfit = 0;

      (allInvoices || []).forEach((inv: any) => {
        // Sum all line profits from invoice items
        const invoiceProfit = (inv.invoice_items || []).reduce((sum: number, item: any) => 
          sum + Number(item.line_profit || 0), 0);
        
        totalProfit += invoiceProfit;

        const invoiceTotal = Number(inv.total_amount) || 0;
        const amountPaid = Number(inv.amount_paid) || 0;

        if (invoiceTotal > 0) {
          // Calculate payment ratio
          const paymentRatio = Math.min(amountPaid / invoiceTotal, 1);
          const invoiceRecognizedProfit = invoiceProfit * paymentRatio;
          const invoicePendingProfit = invoiceProfit - invoiceRecognizedProfit;

          recognizedProfit += invoiceRecognizedProfit;
          pendingProfit += invoicePendingProfit;
        }
      });

      // Net Profit = Beginning Balance + Amount Collected - Expenses
      const profit = beginningBalance + collectedAmount - totalExpenses;
      
      const pendingCommissions = allCommissions?.filter(c => c.paid_status === 'unpaid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;
      const paidCommissions = allCommissions?.filter(c => c.paid_status === 'paid').reduce((sum, comm) => sum + Number(comm.commission_amount || 0), 0) || 0;
      
      const { count: invoiceCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalRevenue,
        collectedAmount,
        outstandingAmount,
        totalExpenses,
        profit,
        recognizedProfit,
        pendingProfit,
        totalProfit,
        pendingCommissions,
        paidCommissions,
        totalInvoices: invoiceCount || 0,
      });
    } catch (error: any) {
      console.error('Error fetching actual stats:', error);
    }
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
      // Fetch ALL invoices (accessible to both admin and accountant via RLS)
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
            amount,
            product_id,
            sale_type,
            width_m,
            height_m,
            area_m2,
            rate_per_m2,
            product:products(id, name)
          ),
          payments(
            id,
            amount,
            discount_amount,
            discount_type,
            discount_reason
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
    }
  };

  const fetchFilteredData = async () => {
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
          user_id,
          order_id,
          commission_type
        `)
        .gte('created_at', startDateFilter)
        .lte('created_at', endDateFilter)
        .order('created_at', { ascending: false });

      let enrichedCommissions: any[] = [];
      if (commissionsData && commissionsData.length > 0) {
        // Batch fetch all unique user profiles and orders in single queries
        const uniqueUserIds = [...new Set(commissionsData.map(c => c.user_id).filter(Boolean))];
        const uniqueOrderIds = [...new Set(commissionsData.map(c => c.order_id).filter(Boolean))];

        const [profilesResult, ordersResult] = await Promise.all([
          uniqueUserIds.length > 0 
            ? supabase.from('profiles').select('id, full_name').in('id', uniqueUserIds)
            : { data: [] },
          uniqueOrderIds.length > 0
            ? supabase.from('orders').select('id, job_title').in('id', uniqueOrderIds)
            : { data: [] }
        ]);

        const profilesMap = new Map((profilesResult.data || []).map(p => [p.id, p]));
        const ordersMap = new Map((ordersResult.data || []).map(o => [o.id, o]));

        enrichedCommissions = commissionsData.map(comm => ({
          ...comm,
          user: profilesMap.get(comm.user_id) || { full_name: 'Unknown' },
          order: ordersMap.get(comm.order_id) || { job_title: 'Unknown' },
        }));
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

      // Fetch ALL payments (accessible to both admin and accountant via RLS)
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
          ),
          invoice:invoices(
            invoice_number,
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

  const fetchPrintOperators = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'print_operator');
      
      if (data && data.length > 0) {
        const operatorIds = data.map(d => d.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', operatorIds);
        
        setPrintOperators(profiles || []);
      }
    } catch (error) {
      console.error('Error fetching print operators:', error);
    }
  };

  const fetchWorkflowOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (name, email, phone),
          invoices:invoices!order_id (
            id,
            invoice_number,
            is_draft,
            subtotal,
            tax_amount,
            total_amount,
            due_date,
            notes,
            terms,
            invoice_items (
              id,
              description,
              quantity,
              unit_price,
              amount,
              product_id,
              retail_unit,
              sale_type,
              width_m,
              height_m,
              area_m2,
              rate_per_m2,
              cost_per_unit,
              product:products(id, name, sale_type, selling_price, selling_price_per_m2, cost_per_retail_unit, cost_per_m2, retail_unit)
            )
          )
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

          const invoices = Array.isArray((order as any).invoices) ? (order as any).invoices : [];
          const invoice_count = invoices.length;
          // Check for draft invoice
          const draft_invoice = invoices.find((inv: any) => inv.is_draft === true);
          const has_draft_invoice = !!draft_invoice;
          // Check if there's an active (non-draft) invoice with proper number
          const active_invoice = invoices.find((inv: any) => !inv.is_draft && inv.invoice_number && !inv.invoice_number.startsWith('DRAFT-') && inv.invoice_number !== 'PENDING');
          const has_active_invoice = !!active_invoice;
          
          return { ...order, salesperson, designer, invoice_count, draft_invoice, has_draft_invoice, has_active_invoice };
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
      // Check if invoice exists for this order AND has a proper invoice number assigned
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_number')
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

      // Check if invoice has a proper number (not PENDING or draft placeholder)
      const invoice = invoiceData[0];
      if (!invoice.invoice_number || invoice.invoice_number === 'PENDING' || invoice.invoice_number.startsWith('DRAFT-')) {
        toast({
          title: 'Invoice Number Required',
          description: 'Please assign an invoice number before assigning a designer. Edit the invoice to set the number.',
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

  const handleApproveAndSendToPrint = async (orderId: string, printOperatorId?: string) => {
    if (!printOperatorId) {
      toast({
        title: 'Print Operator Required',
        description: 'Please select a print operator to assign this job to',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Check if invoice exists for this order
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (invoiceError) throw invoiceError;

      if (!invoice) {
        toast({
          title: 'Invoice Required',
          description: 'Please create an invoice for this order before sending to print',
          variant: 'destructive',
        });
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Check payment status based on invoice
      const totalPaid = invoice.amount_paid || 0;
      const totalAmount = invoice.total_amount || 0;
      const isPaid = totalPaid >= totalAmount;

      // Prepare update object - combine all updates into one including print operator assignment
      const orderUpdate: any = {
        status: 'printing',
        print_operator_id: printOperatorId
      };

      if (isPaid) {
        // If fully paid and not already recorded in order, update order payment
        const orderPaid = orderData.amount_paid || 0;
        if (orderPaid < orderData.order_value) {
          const remainingAmount = orderData.order_value - orderPaid;
          
          orderUpdate.amount_paid = orderData.order_value;
          orderUpdate.payment_status = 'paid';

          // Record the payment in payments table (parallel to order update)
          await supabase
            .from('payments')
            .insert({
              order_id: orderId,
              invoice_id: invoice.id,
              amount: remainingAmount,
              payment_method: 'bank_transfer',
              payment_date: new Date().toISOString(),
              recorded_by: user?.id,
              notes: 'Auto-recorded when sending to print (invoice fully paid)',
            });
        }
      } else {
        // Mark as debt (unpaid/partial) but allow to proceed
        const currentPaid = orderData.amount_paid || 0;
        orderUpdate.payment_status = currentPaid > 0 ? 'partial' : 'unpaid';
      }

      // Single update combining status, print operator, and payment info
      const { error } = await supabase
        .from('orders')
        .update(orderUpdate)
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: isPaid 
          ? 'Payment recorded and order sent to print operator'
          : 'Order marked as debt and sent to print operator',
      });

      setSelectedOrderForPrintAssignment('');
      setSelectedPrintOperator('');
      fetchWorkflowOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRecordDebt = async () => {
    if (!selectedOrderForDebt) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get invoice for this order
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('order_id', selectedOrderForDebt.id)
        .maybeSingle();

      if (invoiceError) throw invoiceError;

      if (!invoice) {
        toast({
          title: 'Invoice Required',
          description: 'Please create an invoice first before recording as debt',
          variant: 'destructive',
        });
        return;
      }

      // Update order to mark as unpaid/debt
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'unpaid',
        })
        .eq('id', selectedOrderForDebt.id);

      if (error) throw error;

      // Record in payments table with notes indicating debt
      await supabase
        .from('payments')
        .insert({
          order_id: selectedOrderForDebt.id,
          invoice_id: invoice.id,
          amount: 0,
          payment_method: 'cash',
          payment_date: new Date().toISOString(),
          recorded_by: user?.id,
          notes: `OUTSTANDING DEBT: ${debtNotes || 'Customer has not paid yet. Invoice: ' + invoice.invoice_number}`,
        });

      toast({
        title: 'Success',
        description: 'Order marked as outstanding debt',
      });

      setDebtDialogOpen(false);
      setSelectedOrderForDebt(null);
      setDebtNotes('');
      fetchWorkflowOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleOpenAddPayment = async (customerId?: string) => {
    const selectedCustomerId = customerId || paymentCustomer;
    if (!selectedCustomerId) {
      toast({
        title: 'Error',
        description: 'Please select a customer first',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Fetch all outstanding invoices for this customer
      const { data: outstandingInvoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', selectedCustomerId)
        .neq('status', 'paid')
        .order('invoice_date', { ascending: true });

      if (error) throw error;
      setCustomerInvoices(outstandingInvoices || []);
      
      // Initialize payment allocation with all invoices unselected
      setPaymentAllocation((outstandingInvoices || []).map(inv => ({
        invoiceId: inv.id,
        amount: 0,
        selected: false,
        discountType: 'fixed' as const,
        discountValue: 0,
        discountReason: ''
      })));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }

    if (customerId) setPaymentCustomer(customerId);
  };

  const handleToggleInvoiceSelection = (invoiceId: string) => {
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { 
            ...alloc, 
            selected: !alloc.selected, 
            amount: !alloc.selected ? (customerInvoices.find(inv => inv.id === invoiceId)?.total_amount - customerInvoices.find(inv => inv.id === invoiceId)?.amount_paid || 0) : 0,
            discountType: 'fixed' as const,
            discountValue: 0,
            discountReason: ''
          }
        : alloc
    ));
  };

  const handleInvoiceDiscountTypeChange = (invoiceId: string, type: 'fixed' | 'percentage') => {
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { ...alloc, discountType: type, discountValue: 0 }
        : alloc
    ));
  };

  const handleInvoiceDiscountValueChange = (invoiceId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { ...alloc, discountValue: numValue }
        : alloc
    ));
  };

  const handleInvoiceDiscountReasonChange = (invoiceId: string, reason: string) => {
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { ...alloc, discountReason: reason }
        : alloc
    ));
  };

  const calculateDiscountAmount = (allocation: typeof paymentAllocation[0], invoice: any) => {
    const outstanding = invoice.total_amount - invoice.amount_paid;
    if (allocation.discountType === 'percentage') {
      return (outstanding * allocation.discountValue) / 100;
    }
    return allocation.discountValue;
  };

  const calculatePayableAfterDiscount = (allocation: typeof paymentAllocation[0], invoice: any) => {
    const outstanding = invoice.total_amount - invoice.amount_paid;
    const discountAmount = calculateDiscountAmount(allocation, invoice);
    return Math.max(0, outstanding - discountAmount);
  };

  const handleInvoicePaymentAmountChange = (invoiceId: string, value: string) => {
    const amount = parseFloat(value) || 0;
    const invoice = customerInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;
    
    const maxAmount = invoice.total_amount - invoice.amount_paid;
    const finalAmount = Math.min(amount, maxAmount);
    
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { ...alloc, amount: finalAmount }
        : alloc
    ));
  };

  const handleRecordPayment = async () => {
    const selectedAllocations = paymentAllocation.filter(alloc => alloc.selected && alloc.amount > 0);
    
    if (!paymentCustomer || selectedAllocations.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please select at least one invoice and enter payment amount(s)',
        variant: 'destructive',
      });
      return;
    }

    if (!paymentMethod || !paymentReference) {
      toast({
        title: 'Missing Information',
        description: 'Please provide payment method and reference number',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const totalAmount = selectedAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      const totalDiscount = selectedAllocations.reduce((sum, alloc) => {
        const invoice = customerInvoices.find(inv => inv.id === alloc.invoiceId);
        if (!invoice) return sum;
        return sum + calculateDiscountAmount(alloc, invoice);
      }, 0);

      // Allocate payment across selected invoices
      for (const alloc of selectedAllocations) {
        const invoice = customerInvoices.find(inv => inv.id === alloc.invoiceId);
        if (!invoice) continue;

        // Calculate discount amount for this invoice
        const discountAmount = calculateDiscountAmount(alloc, invoice);
        const totalCredited = alloc.amount + discountAmount;

        // Update invoice amount_paid and status (include discount as credit)
        const newAmountPaid = invoice.amount_paid + totalCredited;
        const invoiceStatus = newAmountPaid >= invoice.total_amount ? 'paid' : 'partial';

        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({
            amount_paid: newAmountPaid,
            status: invoiceStatus,
          })
          .eq('id', alloc.invoiceId);

        if (invoiceError) throw invoiceError;

        // Create payment record for this invoice allocation with discount
        const { error: paymentError } = await supabase
          .from('payments')
          .insert([{
            invoice_id: alloc.invoiceId,
            order_id: invoice.order_id,
            amount: alloc.amount,
            payment_method: paymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
            reference_number: paymentReference || null,
            notes: paymentNotes || null,
            recorded_by: user?.id,
            discount_type: alloc.discountType,
            discount_value: alloc.discountValue,
            discount_amount: discountAmount,
            discount_reason: alloc.discountReason || null,
          }]);

        if (paymentError) throw paymentError;
      }

      toast({
        title: 'Payment Recorded',
        description: `Payment of $${totalAmount.toFixed(2)}${totalDiscount > 0 ? ` with discount of $${totalDiscount.toFixed(2)}` : ''} allocated across ${selectedAllocations.length} invoice(s)`,
      });

      setPaymentDialogOpen(false);
      setPaymentCustomer('');
      setPaymentAmount('');
      setPaymentMethod('cash');
      setPaymentReference('');
      setPaymentNotes('');
      setCustomerInvoices([]);
      setPaymentAllocation([]);
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRecordInvoicePayment = async () => {
    if (!selectedInvoiceForPayment || !invoicePaymentAmount || !invoicePaymentMethod || !invoicePaymentReference) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields including receipt number',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const paymentAmountNum = parseFloat(invoicePaymentAmount);
      const invoice = selectedInvoiceForPayment;
      
      // Calculate discount amount
      const discountValue = parseFloat(invoicePaymentDiscountValue) || 0;
      const invoiceBalance = invoice.total_amount - invoice.amount_paid;
      let discountAmount = 0;
      
      if (discountValue > 0) {
        if (invoicePaymentDiscountType === 'percentage') {
          discountAmount = (invoiceBalance * discountValue) / 100;
        } else {
          discountAmount = discountValue;
        }
        
        // Prevent discount from exceeding balance
        if (discountAmount > invoiceBalance) {
          toast({
            title: 'Invalid Discount',
            description: 'Discount cannot exceed the remaining balance',
            variant: 'destructive',
          });
          return;
        }
      }
      
      // The effective amount credited to invoice = payment + discount
      const effectiveAmountPaid = paymentAmountNum + discountAmount;
      
      // Record payment in payments table
      const paymentData: any = {
        invoice_id: invoice.id,
        order_id: invoice.order_id || null,
        amount: paymentAmountNum,
        payment_method: invoicePaymentMethod as 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'card',
        reference_number: invoicePaymentReference || null,
        notes: invoicePaymentNotes || `Payment for invoice ${invoice.invoice_number}`,
        recorded_by: user?.id,
        discount_type: invoicePaymentDiscountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        discount_reason: invoicePaymentDiscountReason || null,
      };

      const { error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData]);

      if (paymentError) throw paymentError;

      // Update invoice amount_paid and status (credit both payment and discount)
      const newAmountPaid = Number(invoice.amount_paid || 0) + effectiveAmountPaid;
      const invoiceTotal = Number(invoice.total_amount);
      
      let invoiceStatus = invoice.status;
      if (newAmountPaid >= invoiceTotal) {
        invoiceStatus = 'paid';
      } else if (newAmountPaid > 0) {
        invoiceStatus = 'partially_paid';
      }

      const { error: invoiceUpdateError } = await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          status: invoiceStatus,
        })
        .eq('id', invoice.id);

      if (invoiceUpdateError) throw invoiceUpdateError;

      // If invoice is linked to an order, update order payment status too
      if (invoice.order_id) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('amount_paid, order_value')
          .eq('id', invoice.order_id)
          .single();

        if (orderData) {
          const orderNewAmountPaid = Number(orderData.amount_paid || 0) + effectiveAmountPaid;
          const orderPaymentStatus = orderNewAmountPaid >= orderData.order_value ? 'paid' : 
                                     orderNewAmountPaid > 0 ? 'partial' : 'unpaid';

          await supabase
            .from('orders')
            .update({
              amount_paid: orderNewAmountPaid,
              payment_status: orderPaymentStatus,
            })
            .eq('id', invoice.order_id);
        }
      }

      // If invoice is fully paid, update any linked sales_order_requests
      if (invoiceStatus === 'paid') {
        await supabase
          .from('sales_order_requests')
          .update({ payment_status: 'paid' })
          .eq('linked_invoice_id', invoice.id);
        
        // Update viewSalesRequest if it's the same invoice
        if (viewSalesRequest && viewSalesRequest.linked_invoice_id === invoice.id) {
          setViewSalesRequest({ ...viewSalesRequest, payment_status: 'paid' });
        }
      }

      const discountMsg = discountAmount > 0 ? ` (with $${discountAmount.toFixed(2)} discount)` : '';
      toast({
        title: 'Success',
        description: `Payment of $${paymentAmountNum.toFixed(2)} recorded successfully${discountMsg}`,
      });

      // Reset form and close dialog
      setSelectedInvoiceForPayment(null);
      setInvoicePaymentAmount('');
      setInvoicePaymentMethod('');
      setInvoicePaymentReference('');
      setInvoicePaymentNotes('');
      setInvoicePaymentDiscountType('fixed');
      setInvoicePaymentDiscountValue('');
      setInvoicePaymentDiscountReason('');
      setInvoicePaymentDialogOpen(false);
      
      fetchActualStats();
      fetchFilteredData();
      fetchInvoices();
      fetchSalesRequests();
      fetchAllPayments();
    } catch (error: any) {
      console.error('Invoice payment recording error:', error);
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
      
      fetchActualStats();
      fetchFilteredData();
      fetchAllExpenses();
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

      fetchActualStats();
      fetchFilteredData();
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

  const addInvoiceItem = () => {
    setInvoiceItems([...invoiceItems, { 
      description: '', 
      quantity: 1, 
      unit_price: 0, 
      amount: 0, 
      sale_type: 'unit',
      width_m: null,
      height_m: null,
      area_m2: null
    }]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newItems = [...invoiceItems];
    const isAreaBased = product.sale_type === 'area';
    
    if (isAreaBased) {
      // Area-based product - set up with default 1x1 dimensions
      const defaultWidth = 1;
      const defaultHeight = 1;
      const area = defaultWidth * defaultHeight;
      const unitPrice = Number(product.selling_price_per_m2 || 0);
      const costPerUnit = Number(product.cost_per_m2 || 0);
      const lineAmount = area * unitPrice;
      const lineCost = area * costPerUnit;
      const lineProfit = lineAmount - lineCost;

      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        description: product.name,
        unit_price: unitPrice,
        retail_unit: 'm²',
        cost_per_unit: costPerUnit,
        line_cost: lineCost,
        line_profit: lineProfit,
        amount: lineAmount,
        sale_type: 'area',
        width_m: defaultWidth,
        height_m: defaultHeight,
        area_m2: area,
        quantity: 1, // For area-based, quantity is always 1
      };
    } else {
      // Unit-based product
      const quantity = newItems[index].quantity || 1;
      const costPerUnit = Number(product.cost_per_retail_unit || 0);
      const lineCost = costPerUnit * quantity;
      const lineAmount = product.selling_price * quantity;
      const lineProfit = lineAmount - lineCost;

      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        description: product.name,
        unit_price: product.selling_price,
        retail_unit: product.retail_unit,
        cost_per_unit: costPerUnit,
        line_cost: lineCost,
        line_profit: lineProfit,
        amount: lineAmount,
        sale_type: 'unit',
        width_m: null,
        height_m: null,
        area_m2: null,
      };
    }
    setInvoiceItems(newItems);
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number | null) => {
    const newItems = [...invoiceItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    const item = newItems[index];
    const isAreaBased = item.sale_type === 'area';
    
    if (isAreaBased) {
      // Auto-calculate area, amount and profit for area-based items (quantity × width × height × rate)
      if (field === 'width_m' || field === 'height_m' || field === 'unit_price' || field === 'quantity') {
        const width = field === 'width_m' ? Number(value) || 0 : item.width_m || 0;
        const height = field === 'height_m' ? Number(value) || 0 : item.height_m || 0;
        const quantity = field === 'quantity' ? Number(value) || 1 : item.quantity || 1;
        const area = width * height;
        const totalArea = area * quantity;
        const unitPrice = field === 'unit_price' ? Number(value) : item.unit_price;
        const costPerUnit = item.cost_per_unit || 0;
        
        newItems[index].area_m2 = area;
        newItems[index].amount = totalArea * unitPrice;
        newItems[index].line_cost = totalArea * costPerUnit;
        newItems[index].line_profit = newItems[index].amount - (newItems[index].line_cost || 0);
      }
    } else {
      // Auto-calculate amount and profit for unit-based items
      if (field === 'quantity' || field === 'unit_price') {
        const quantity = field === 'quantity' ? Number(value) : item.quantity;
        const unitPrice = field === 'unit_price' ? Number(value) : item.unit_price;
        const costPerUnit = item.cost_per_unit || 0;
        
        newItems[index].amount = quantity * unitPrice;
        newItems[index].line_cost = quantity * costPerUnit;
        newItems[index].line_profit = newItems[index].amount - (newItems[index].line_cost || 0);
      }
    }
    
    setInvoiceItems(newItems);
  };

  const calculateInvoiceSubtotal = () => {
    return invoiceItems.reduce((sum, item) => {
      if (item.sale_type === 'area') {
        const area = (item.width_m || 0) * (item.height_m || 0);
        const quantity = item.quantity || 1;
        return sum + (area * quantity * item.unit_price);
      }
      return sum + (item.quantity * item.unit_price);
    }, 0);
  };

  const calculateTotalProfit = () => {
    return invoiceItems.reduce((sum, item) => {
      if (item.sale_type === 'area') {
        const area = (item.width_m || 0) * (item.height_m || 0);
        const quantity = item.quantity || 1;
        const totalArea = area * quantity;
        const lineProfit = (totalArea * item.unit_price) - (totalArea * (item.cost_per_unit || 0));
        return sum + lineProfit;
      }
      return sum + (item.line_profit || 0);
    }, 0);
  };

  const handleCreateInvoice = async () => {
    if (!invoiceNumber || !invoiceCustomer || invoiceItems.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please provide invoice number, customer and add at least one item',
        variant: 'destructive',
      });
      return;
    }

    // Validate all items have descriptions
    const hasEmptyDescriptions = invoiceItems.some(item => !item.description.trim());
    if (hasEmptyDescriptions) {
      toast({
        title: 'Validation Error',
        description: 'All items must have a description',
        variant: 'destructive',
      });
      return;
    }

    // Validate stock availability for product items
    for (const item of invoiceItems) {
      if (item.product_id) {
        const product = products.find(p => p.id === item.product_id);
        if (product && item.quantity > product.stock_quantity) {
          toast({
            title: 'Insufficient Stock',
            description: `Not enough stock for ${product.name}. Available: ${product.stock_quantity} ${product.retail_unit}(s)`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const subtotal = calculateInvoiceSubtotal();
      const tax = invoiceTax ? parseFloat(invoiceTax) : 0;
      const total = subtotal + tax;

      // Insert invoice
      const { data: invoiceData, error: invoiceError } = await supabase
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
          project_name: invoiceProjectName || null,
          created_by: user?.id,
          status: 'draft',
        }])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert invoice items with product info, cost/profit data, and area-based fields
      const itemsToInsert = invoiceItems.map(item => {
        const isAreaBased = item.sale_type === 'area';
        const area = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : null;
        const lineAmount = isAreaBased 
          ? (area || 0) * item.unit_price 
          : item.quantity * item.unit_price;
        const lineCost = isAreaBased 
          ? (area || 0) * (item.cost_per_unit || 0) 
          : item.quantity * (item.cost_per_unit || 0);
        const lineProfit = lineAmount - lineCost;
        
        return {
          invoice_id: invoiceData.id,
          description: item.description,
          quantity: isAreaBased ? 1 : item.quantity,
          unit_price: item.unit_price,
          amount: lineAmount,
          product_id: item.product_id || null,
          retail_unit: item.retail_unit || 'piece',
          cost_per_unit: item.cost_per_unit || 0,
          line_cost: lineCost,
          line_profit: lineProfit,
          sale_type: item.sale_type || 'unit',
          height_m: isAreaBased ? item.height_m : null,
          width_m: isAreaBased ? item.width_m : null,
          area_m2: area,
          rate_per_m2: isAreaBased ? item.unit_price : null,
        };
      });

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // If there's a pending sales request link, link the invoice and update status
      if (pendingSalesRequestLink) {
        const { error: linkError } = await supabase
          .from('sales_order_requests')
          .update({ linked_invoice_id: invoiceData.id })
          .eq('id', pendingSalesRequestLink.requestId);
        
        if (!linkError) {
          // Update the sales request status
          const finalStatus = pendingSalesRequestLink.newStatus === 'collected' ? 'completed' : pendingSalesRequestLink.newStatus;
          
          const updateData: any = { 
            status: finalStatus,
            updated_at: new Date().toISOString()
          };
          
          if (['processed', 'in_design', 'in_print', 'printed', 'collected', 'completed'].includes(pendingSalesRequestLink.newStatus)) {
            updateData.processed_at = new Date().toISOString();
          }

          await supabase
            .from('sales_order_requests')
            .update(updateData)
            .eq('id', pendingSalesRequestLink.requestId);
          
          toast({
            title: 'Success',
            description: `Invoice ${invoiceNumber} created and linked to sales request. Status updated to ${finalStatus.replace('_', ' ')}.`,
          });
          
          fetchSalesRequests();
        } else {
          toast({
            title: 'Warning',
            description: `Invoice created but failed to link to sales request: ${linkError.message}`,
            variant: 'destructive',
          });
        }
        
        setPendingSalesRequestLink(null);
      } else {
        toast({
          title: 'Success',
          description: `Invoice ${invoiceNumber} created successfully`,
        });
      }

      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceTerms('');
      setInvoiceProjectName('');
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }]);
      setCreateInvoiceDialogOpen(false);
      
      fetchInvoices();
      fetchActualStats();
      fetchProducts(); // Refresh products to get updated stock
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Load draft invoice into form for activation
  const loadDraftInvoiceForActivation = (order: any) => {
    const draft = order.draft_invoice;
    if (!draft) return;
    
    setActivatingDraftInvoice(draft);
    setInvoiceOrder(order.id);
    setInvoiceCustomer(order.customer_id);
    setInvoiceNumber(''); // Accountant will assign the number
    setInvoiceDueDate(draft.due_date || '');
    setInvoiceTax(draft.tax_amount?.toString() || '');
    setInvoiceNotes(draft.notes || '');
    setInvoiceTerms(draft.terms || '');
    
    // Load invoice items
    if (draft.invoice_items && draft.invoice_items.length > 0) {
      setInvoiceItems(draft.invoice_items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || item.rate_per_m2 || 0,
        amount: item.amount || 0,
        product_id: item.product_id || null,
        retail_unit: item.retail_unit || item.product?.retail_unit || 'piece',
        cost_per_unit: item.cost_per_unit || item.product?.cost_per_retail_unit || item.product?.cost_per_m2 || 0,
        sale_type: item.sale_type || 'unit',
        width_m: item.width_m || null,
        height_m: item.height_m || null,
        area_m2: item.area_m2 || null,
      })));
    } else {
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }]);
    }
    
    setAssignNumberDialogOpen(true);
  };

  // Activate draft invoice by assigning a number
  const handleActivateDraftInvoice = async () => {
    if (!activatingDraftInvoice || !invoiceNumber.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an invoice number',
        variant: 'destructive',
      });
      return;
    }

    try {
      const subtotal = calculateInvoiceSubtotal();
      const tax = invoiceTax ? parseFloat(invoiceTax) : 0;
      const total = subtotal + tax;

      // Update the draft invoice to activate it
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          invoice_number: invoiceNumber,
          is_draft: false,
          subtotal: subtotal,
          tax_amount: tax,
          total_amount: total,
          due_date: invoiceDueDate || null,
          notes: invoiceNotes || null,
          terms: invoiceTerms || null,
          status: 'draft', // Keep as draft until paid
        })
        .eq('id', activatingDraftInvoice.id);

      if (updateError) throw updateError;

      // Delete existing items and re-insert with updated values
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', activatingDraftInvoice.id);

      if (deleteError) throw deleteError;

      // Insert updated invoice items
      const itemsToInsert = invoiceItems.map(item => {
        const isAreaBased = item.sale_type === 'area';
        const area = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : null;
        const lineAmount = isAreaBased 
          ? (area || 0) * item.unit_price 
          : item.quantity * item.unit_price;
        const lineCost = isAreaBased 
          ? (area || 0) * (item.cost_per_unit || 0) 
          : item.quantity * (item.cost_per_unit || 0);
        const lineProfit = lineAmount - lineCost;
        
        return {
          invoice_id: activatingDraftInvoice.id,
          description: item.description,
          quantity: isAreaBased ? 1 : item.quantity,
          unit_price: item.unit_price,
          amount: lineAmount,
          product_id: item.product_id || null,
          retail_unit: item.retail_unit || 'piece',
          cost_per_unit: item.cost_per_unit || 0,
          line_cost: lineCost,
          line_profit: lineProfit,
          sale_type: item.sale_type || 'unit',
          height_m: isAreaBased ? item.height_m : null,
          width_m: isAreaBased ? item.width_m : null,
          area_m2: area,
          rate_per_m2: isAreaBased ? item.unit_price : null,
        };
      });

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: `Invoice ${invoiceNumber} activated successfully`,
      });

      // Reset form
      setActivatingDraftInvoice(null);
      setAssignNumberDialogOpen(false);
      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceTerms('');
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }]);
      
      fetchInvoices();
      fetchWorkflowOrders();
      fetchActualStats();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEditInvoice = (invoice: any) => {
    setEditingInvoice(invoice);
    setInvoiceNumber(invoice.invoice_number);
    setInvoiceCustomer(invoice.customer_id);
    setInvoiceOrder(invoice.order_id || '');
    setInvoiceDueDate(invoice.due_date || '');
    setInvoiceTax(invoice.tax_amount?.toString() || '');
    setInvoiceNotes(invoice.notes || '');
    setInvoiceProjectName(invoice.project_name || '');
    
    // Load invoice items with product info
    if (invoice.invoice_items && invoice.invoice_items.length > 0) {
      setInvoiceItems(invoice.invoice_items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
        product_id: item.product_id || undefined,
        retail_unit: item.retail_unit || 'piece',
        cost_per_unit: item.cost_per_unit || 0,
        line_cost: item.line_cost || 0,
        line_profit: item.line_profit || 0,
        sale_type: item.sale_type || 'unit',
        width_m: item.width_m || null,
        height_m: item.height_m || null,
        area_m2: item.area_m2 || null,
      })));
    } else {
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }]);
    }
    
    setEditInvoiceDialogOpen(true);
  };

  const handleUpdateInvoice = async () => {
    if (!invoiceNumber || !invoiceCustomer || invoiceItems.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields and add at least one item',
        variant: 'destructive',
      });
      return;
    }

    const hasEmptyDescriptions = invoiceItems.some(item => !item.description.trim());
    if (hasEmptyDescriptions) {
      toast({
        title: 'Validation Error',
        description: 'All items must have a description',
        variant: 'destructive',
      });
      return;
    }

    // Validate stock availability for product items
    for (const item of invoiceItems) {
      if (item.product_id) {
        const product = products.find(p => p.id === item.product_id);
        if (product && item.quantity > product.stock_quantity) {
          toast({
            title: 'Insufficient Stock',
            description: `Not enough stock for ${product.name}. Available: ${product.stock_quantity} ${product.retail_unit}(s)`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    try {
      const subtotal = calculateInvoiceSubtotal();
      const tax = parseFloat(invoiceTax) || 0;
      const total = subtotal + tax;

      // Update invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          invoice_number: invoiceNumber,
          customer_id: invoiceCustomer,
          order_id: invoiceOrder || null,
          due_date: invoiceDueDate || null,
          subtotal,
          tax_amount: tax,
          total_amount: total,
          notes: invoiceNotes || null,
          project_name: invoiceProjectName || null,
        })
        .eq('id', editingInvoice.id);

      if (invoiceError) throw invoiceError;

      // Delete existing invoice items (triggers will restore inventory)
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', editingInvoice.id);

      if (deleteError) throw deleteError;

      // Insert new invoice items with product info and area-based fields
      const itemsToInsert = invoiceItems.map(item => {
        const isAreaBased = item.sale_type === 'area';
        const area = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : null;
        const lineAmount = isAreaBased 
          ? (area || 0) * item.unit_price 
          : item.quantity * item.unit_price;
        const lineCost = isAreaBased 
          ? (area || 0) * (item.cost_per_unit || 0) 
          : item.quantity * (item.cost_per_unit || 0);
        const lineProfit = lineAmount - lineCost;
        
        return {
          invoice_id: editingInvoice.id,
          description: item.description,
          quantity: isAreaBased ? 1 : item.quantity,
          unit_price: item.unit_price,
          amount: lineAmount,
          product_id: item.product_id || null,
          retail_unit: item.retail_unit || 'piece',
          cost_per_unit: item.cost_per_unit || 0,
          line_cost: lineCost,
          line_profit: lineProfit,
          sale_type: item.sale_type || 'unit',
          height_m: isAreaBased ? item.height_m : null,
          width_m: isAreaBased ? item.width_m : null,
          area_m2: area,
          rate_per_m2: isAreaBased ? item.unit_price : null,
        };
      });

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: `Invoice ${invoiceNumber} updated successfully`,
      });

      setEditInvoiceDialogOpen(false);
      setEditingInvoice(null);
      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceProjectName('');
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit', width_m: null, height_m: null, area_m2: null }]);
      
      fetchInvoices();
      fetchActualStats();
      fetchProducts(); // Refresh products to get updated stock
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
      description: 'Total invoice value',
      color: 'text-blue-600',
      onClick: undefined as (() => void) | undefined,
    },
    {
      title: 'Amount Collected',
      value: `$${stats.collectedAmount.toFixed(2)}`,
      icon: TrendingUp,
      description: 'Payments received',
      color: 'text-green-600',
      onClick: undefined as (() => void) | undefined,
    },
    {
      title: 'Outstanding',
      value: `$${stats.outstandingAmount.toFixed(2)}`,
      icon: Clock,
      description: 'Pending payments — Click to view debtors',
      color: 'text-orange-600',
      onClick: () => setOutstandingDebtsDialogOpen(true),
    },
    {
      title: 'Total Expenses',
      value: `$${stats.totalExpenses.toFixed(2)}`,
      icon: TrendingDown,
      description: 'Operational costs',
      color: 'text-red-600',
      onClick: undefined as (() => void) | undefined,
    },
    {
      title: 'Net Profit',
      value: `$${stats.profit.toFixed(2)}`,
      icon: DollarSign,
      description: 'Opening Balance + Collected - Expenses',
      color: stats.profit >= 0 ? 'text-green-600' : 'text-red-600',
      onClick: undefined as (() => void) | undefined,
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
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 w-full overflow-x-hidden">
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
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              className={`mobile-card ${stat.onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30 transition-all' : ''}`}
              onClick={stat.onClick}
            >
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

        {/* Outstanding Debts Dialog */}
        <OutstandingDebtsDialog
          open={outstandingDebtsDialogOpen}
          onOpenChange={setOutstandingDebtsDialogOpen}
        />

        {/* Commission Panel */}
        <CommissionPanel />

        {/* Main Content Tabs */}
        <Tabs defaultValue="sales-requests" className="space-y-3 sm:space-y-4 w-full">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto sm:grid sm:w-full sm:grid-cols-4 lg:grid-cols-9 gap-1">
              <TabsTrigger value="sales-requests" className="text-xs sm:text-sm whitespace-nowrap">Sales Requests</TabsTrigger>
              <TabsTrigger value="collection" className="text-xs sm:text-sm whitespace-nowrap">
                Collection
                {salesRequests.filter(r => r.status === 'printed').length > 0 && (
                  <Badge className="ml-1 bg-teal-500 text-white text-xs">{salesRequests.filter(r => r.status === 'printed').length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="workflow" className="text-xs sm:text-sm whitespace-nowrap">Workflow</TabsTrigger>
              <TabsTrigger value="invoices" className="text-xs sm:text-sm whitespace-nowrap">Invoices</TabsTrigger>
              <TabsTrigger value="customers" className="text-xs sm:text-sm whitespace-nowrap">Customers</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs sm:text-sm whitespace-nowrap">Payments</TabsTrigger>
              <TabsTrigger value="expenses" className="text-xs sm:text-sm whitespace-nowrap">Expenses</TabsTrigger>
              <TabsTrigger value="commissions" className="text-xs sm:text-sm whitespace-nowrap">Commissions</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs sm:text-sm whitespace-nowrap">Reports</TabsTrigger>
            </TabsList>
          </div>

          {/* Sales Requests Tab */}
          <TabsContent value="sales-requests" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Sales Order Requests</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Review requests from sales team and create customers/invoices</CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {salesRequests.filter(r => r.status === 'pending').length} Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[150px]">Customer</TableHead>
                        <TableHead className="min-w-[120px]">Phone</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="min-w-[150px]">Notes</TableHead>
                        <TableHead className="min-w-[80px]">Status</TableHead>
                        <TableHead className="min-w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No sales requests found
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesRequests.map((request) => (
                          <TableRow 
                            key={request.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setViewSalesRequest(request)}
                          >
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(request.created_at), 'PP')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.customer_name}</p>
                                {request.company_name && (
                                  <p className="text-xs text-muted-foreground">{request.company_name}</p>
                                )}
                                {request.customer_email && (
                                  <p className="text-xs text-muted-foreground">{request.customer_email}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{request.customer_phone || '-'}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <p className="truncate">{request.description}</p>
                            </TableCell>
                            <TableCell className="max-w-[150px]">
                              <p className="truncate text-muted-foreground">{request.notes || '-'}</p>
                            </TableCell>
                            <TableCell>
                              {getSalesRequestStatusBadge(request.status)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewSalesRequest(request);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Select
                                  value={request.status}
                                  onValueChange={(value) => {
                                    handleUpdateSalesRequestStatus(request.id, value, request);
                                  }}
                                >
                                  <SelectTrigger className="w-[120px]" onClick={(e) => e.stopPropagation()}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[200px] overflow-y-auto">
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="processed">Processed</SelectItem>
                                    <SelectItem value="in_design">In Design</SelectItem>
                                    <SelectItem value="design_submitted">Design Submitted</SelectItem>
                                    <SelectItem value="in_print">In Print</SelectItem>
                                    <SelectItem value="printed">Printed</SelectItem>
                                    <SelectItem value="collected">Mark Collected (Complete)</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                  </SelectContent>
                                </Select>
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

            {/* View Sales Request Dialog */}
            <Dialog open={!!viewSalesRequest} onOpenChange={(open) => {
              if (!open) {
                setViewSalesRequest(null);
                setRequestFiles([]);
              }
            }}>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 gap-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/30">
                {/* Decorative Header Background */}
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
                
                <DialogHeader className="relative px-6 pt-6 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <DialogTitle className="text-2xl font-bold tracking-tight">
                        Sales Request Details
                      </DialogTitle>
                      <DialogDescription className="text-sm">
                        {viewSalesRequest && `ID: #${viewSalesRequest.id.slice(0, 8)} • ${format(new Date(viewSalesRequest.created_at), 'PPP p')}`}
                      </DialogDescription>
                    </div>
                    {viewSalesRequest && getSalesRequestStatusBadge(viewSalesRequest.status)}
                  </div>
                </DialogHeader>

                <ScrollArea className="max-h-[calc(90vh-120px)]">
                  {viewSalesRequest && (
                    <div className="px-6 pb-6 space-y-6">
                      {/* Customer Section */}
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <h3 className="font-semibold text-lg">Customer Information</h3>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                              <Users className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium uppercase tracking-wider">Name</span>
                            </div>
                            <p className="font-semibold text-foreground">{viewSalesRequest.customer_name}</p>
                          </div>

                          <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                              <FileText className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium uppercase tracking-wider">Company</span>
                            </div>
                            <p className="font-semibold text-foreground">{viewSalesRequest.company_name || '—'}</p>
                          </div>

                          {viewSalesRequest.customer_phone && (
                            <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <Clock className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium uppercase tracking-wider">Phone</span>
                              </div>
                              <p className="font-semibold text-foreground">{viewSalesRequest.customer_phone}</p>
                            </div>
                          )}

                          {viewSalesRequest.customer_email && (
                            <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium uppercase tracking-wider">Email</span>
                              </div>
                              <p className="font-semibold text-foreground truncate">{viewSalesRequest.customer_email}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Job Details Section */}
                      <div className="pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-violet-500" />
                          </div>
                          <h3 className="font-semibold text-lg">Job Details</h3>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-xl border bg-card/50 p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                              <FileText className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium uppercase tracking-wider">Description</span>
                            </div>
                            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{viewSalesRequest.description}</p>
                          </div>

                          {viewSalesRequest.notes && (
                            <div className="rounded-xl border bg-amber-500/5 border-amber-500/20 p-4">
                              <div className="flex items-center gap-2 text-amber-600 mb-2">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium uppercase tracking-wider">Notes</span>
                              </div>
                              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{viewSalesRequest.notes}</p>
                            </div>
                          )}

                          {viewSalesRequest.processed_at && (
                            <div className="rounded-xl border bg-card/50 p-4">
                              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium uppercase tracking-wider">Processed</span>
                              </div>
                              <p className="font-semibold text-foreground">
                                {format(new Date(viewSalesRequest.processed_at), 'PPP p')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Design Files Section - Show for design_submitted status */}
                      {(viewSalesRequest.status === 'design_submitted' || viewSalesRequest.status === 'in_print' || viewSalesRequest.status === 'printed' || viewSalesRequest.status === 'collected') && (
                        <div className="pt-4 border-t border-border/50">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-emerald-500" />
                              </div>
                              <h3 className="font-semibold text-lg">Design Files</h3>
                              {requestFiles.length > 0 && (
                                <Badge variant="secondary" className="ml-2">{requestFiles.length}</Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchRequestFiles(viewSalesRequest.id)}
                              className="gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              Load Files
                            </Button>
                          </div>
                          {requestFiles.length > 0 ? (
                            <div className="space-y-2">
                              {requestFiles.map((file) => (
                                <div
                                  key={file.id}
                                  className="group flex items-center justify-between rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                      <FileText className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm truncate">{file.file_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(new Date(file.created_at), 'MMM d, yyyy • h:mm a')}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDownloadRequestFile(file.file_path, file.file_name)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-dashed bg-muted/30 p-8 text-center">
                              <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
                              <p className="mt-2 text-sm text-muted-foreground">Click "Load Files" to view uploaded designs</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Invoice Linking Section - Show for design_submitted status */}
                      {viewSalesRequest.status === 'design_submitted' && (
                        <div className="pt-4 border-t border-border/50">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <DollarSign className="h-4 w-4 text-blue-500" />
                            </div>
                            <h3 className="font-semibold text-lg">Invoice & Payment</h3>
                          </div>
                          
                          {viewSalesRequest.linked_invoice_id ? (
                            <div className="space-y-4">
                              {/* Show linked invoice info */}
                              {(() => {
                                const linkedInvoice = invoices.find(inv => inv.id === viewSalesRequest.linked_invoice_id);
                                if (!linkedInvoice) return <p className="text-sm text-muted-foreground">Invoice linked but details not found</p>;
                                
                                const balance = linkedInvoice.total_amount - linkedInvoice.amount_paid;
                                return (
                                  <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-4 space-y-3">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Invoice:</span>
                                      <span className="font-semibold">{linkedInvoice.invoice_number}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Customer:</span>
                                      <span className="font-medium">{linkedInvoice.customer?.name}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Total:</span>
                                      <span className="font-medium">${linkedInvoice.total_amount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Paid:</span>
                                      <span className="font-medium text-emerald-600">${linkedInvoice.amount_paid.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                                      <span className="text-muted-foreground font-medium">Balance:</span>
                                      <span className={`font-bold ${balance > 0 ? 'text-destructive' : 'text-success'}`}>
                                        ${balance.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Payment Status */}
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                                <span className="text-sm text-muted-foreground">Payment Status:</span>
                                {viewSalesRequest.payment_status === 'paid' && (
                                  <Badge className="bg-success text-success-foreground">Paid</Badge>
                                )}
                                {viewSalesRequest.payment_status === 'debt' && (
                                  <Badge className="bg-destructive text-destructive-foreground">Outstanding Debt</Badge>
                                )}
                                {viewSalesRequest.payment_status === 'pending' && (
                                  <Badge variant="secondary">Pending Payment</Badge>
                                )}
                              </div>

                              {/* Payment/Debt Actions */}
                              {viewSalesRequest.payment_status === 'pending' && (
                                <div className="flex gap-3">
                                  <Button
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => {
                                      const linkedInvoice = invoices.find(inv => inv.id === viewSalesRequest.linked_invoice_id);
                                      if (linkedInvoice) {
                                        setSelectedInvoiceForPayment(linkedInvoice);
                                        setInvoicePaymentDialogOpen(true);
                                      }
                                    }}
                                  >
                                    <DollarSign className="h-4 w-4" />
                                    Record Payment
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      const { error } = await supabase
                                        .from('sales_order_requests')
                                        .update({ payment_status: 'debt' })
                                        .eq('id', viewSalesRequest.id);
                                      if (!error) {
                                        toast({ title: 'Marked as outstanding debt' });
                                        setViewSalesRequest({ ...viewSalesRequest, payment_status: 'debt' });
                                        fetchSalesRequests();
                                      }
                                    }}
                                  >
                                    Mark as Debt
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="rounded-xl border bg-muted/30 p-4">
                                <p className="text-sm text-muted-foreground">
                                  Link an invoice for customer: <strong className="text-foreground">{viewSalesRequest.customer_name}</strong>
                                </p>
                              </div>
                              <Select
                                onValueChange={async (invoiceId) => {
                                  const { error } = await supabase
                                    .from('sales_order_requests')
                                    .update({ linked_invoice_id: invoiceId })
                                    .eq('id', viewSalesRequest.id);
                                  if (!error) {
                                    toast({ title: 'Invoice linked successfully' });
                                    setViewSalesRequest({ ...viewSalesRequest, linked_invoice_id: invoiceId });
                                    fetchSalesRequests();
                                  } else {
                                    toast({ title: 'Error', description: error.message, variant: 'destructive' });
                                  }
                                }}
                              >
                                <SelectTrigger className="rounded-xl">
                                  <SelectValue placeholder="Select invoice to link..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px] overflow-y-auto">
                                  {invoices
                                    .filter(inv => !inv.is_draft && inv.invoice_number !== 'PENDING')
                                    .map((invoice) => (
                                      <SelectItem key={invoice.id} value={invoice.id}>
                                        {invoice.invoice_number} - {invoice.customer?.name} (${invoice.total_amount.toFixed(2)})
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                Create an invoice first if one doesn't exist for this customer
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Workflow Actions Section */}
                      <div className="pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-orange-500" />
                          </div>
                          <h3 className="font-semibold text-lg">Workflow Actions</h3>
                        </div>

                        <div className="space-y-4">
                          {/* Status Change */}
                          <div className="rounded-xl border bg-card/50 p-4">
                            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Change Status</Label>
                            {/* Show warning if pending and no invoice linked */}
                            {viewSalesRequest.status === 'pending' && !viewSalesRequest.linked_invoice_id && (
                              <div className="mt-2 mb-2 rounded-lg bg-warning/10 border border-warning/30 p-3">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-warning" />
                                  <p className="text-xs text-warning-foreground">
                                    Create and link an invoice before changing status
                                  </p>
                                </div>
                              </div>
                            )}
                            <Select
                              value={viewSalesRequest.status}
                              onValueChange={(value) => {
                                handleUpdateSalesRequestStatus(viewSalesRequest.id, value, viewSalesRequest);
                                // Only update local state if not showing the dialog
                                if (viewSalesRequest.linked_invoice_id || viewSalesRequest.status !== 'pending' || value === 'pending') {
                                  setViewSalesRequest({ ...viewSalesRequest, status: value });
                                }
                              }}
                            >
                              <SelectTrigger className="mt-2 rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-[200px] overflow-y-auto">
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="processed">Processed</SelectItem>
                                <SelectItem value="in_design">In Design</SelectItem>
                                <SelectItem value="design_submitted">Design Submitted</SelectItem>
                                <SelectItem value="in_print">In Print</SelectItem>
                                <SelectItem value="printed">Printed</SelectItem>
                                <SelectItem value="collected">Collected</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Designer Assignment */}
                          {(viewSalesRequest.status === 'processed' || viewSalesRequest.status === 'pending') && (
                            <div className="rounded-xl border bg-violet-500/5 border-violet-500/20 p-4">
                              <Label className="text-xs font-medium uppercase tracking-wider text-violet-600">Assign Designer</Label>
                              <Select
                                onValueChange={(designerId) => {
                                  handleAssignDesignerToRequest(viewSalesRequest.id, designerId);
                                }}
                              >
                                <SelectTrigger className="mt-2 rounded-xl">
                                  <SelectValue placeholder="Select designer..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px] overflow-y-auto">
                                  {designers.map((designer) => (
                                    <SelectItem key={designer.id} value={designer.id}>
                                      {designer.full_name || 'Unknown Designer'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-2">
                                Assigning a designer will automatically change status to "In Design"
                              </p>
                            </div>
                          )}

                          {/* Print Operator Assignment - Only show if invoice linked and payment handled */}
                          {viewSalesRequest.status === 'design_submitted' && 
                           viewSalesRequest.linked_invoice_id && 
                           (viewSalesRequest.payment_status === 'paid' || viewSalesRequest.payment_status === 'debt') && (
                            <div className="rounded-xl border bg-teal-500/5 border-teal-500/20 p-4">
                              <Label className="text-xs font-medium uppercase tracking-wider text-teal-600">Send to Print Operator</Label>
                              <Select
                                onValueChange={(printOperatorId) => {
                                  handleAssignPrintOperatorToRequest(viewSalesRequest.id, printOperatorId);
                                }}
                              >
                                <SelectTrigger className="mt-2 rounded-xl">
                                  <SelectValue placeholder="Select print operator..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px] overflow-y-auto">
                                  {printOperators.map((operator) => (
                                    <SelectItem key={operator.id} value={operator.id}>
                                      {operator.full_name || 'Unknown Operator'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-2">
                                Assigning a print operator will send the design for printing
                              </p>
                            </div>
                          )}

                          {/* Message if invoice not linked or payment not handled */}
                          {viewSalesRequest.status === 'design_submitted' && 
                           (!viewSalesRequest.linked_invoice_id || viewSalesRequest.payment_status === 'pending') && (
                            <div className="rounded-xl bg-warning/10 border border-warning/30 p-4">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-warning" />
                                <p className="text-sm text-warning-foreground">
                                  {!viewSalesRequest.linked_invoice_id 
                                    ? 'Link an invoice before sending to print operator'
                                    : 'Record payment or mark as debt before sending to print operator'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Collection Tab - Printed orders ready for collection */}
          <TabsContent value="collection" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">Ready for Collection</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Printed orders waiting for customer collection. Mark as collected to complete the order.</CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {salesRequests.filter(r => r.status === 'printed').length} Ready
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[100px]">Date</TableHead>
                        <TableHead className="min-w-[150px]">Customer</TableHead>
                        <TableHead className="min-w-[120px]">Phone</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="min-w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRequests.filter(r => r.status === 'printed').length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No printed orders waiting for collection
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesRequests.filter(r => r.status === 'printed').map((request) => (
                          <TableRow key={request.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(request.created_at), 'PP')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{request.customer_name}</p>
                                {request.company_name && (
                                  <p className="text-xs text-muted-foreground">{request.company_name}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{request.customer_phone || '-'}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <p className="truncate">{request.description}</p>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                onClick={() => handleUpdateSalesRequestStatus(request.id, 'collected')}
                                className="bg-success hover:bg-success/90 text-success-foreground"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Collected
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

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="space-y-3 sm:space-y-4">
            <Card className="mobile-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Orders Pending Assignment</CardTitle>
                <CardDescription className="text-xs sm:text-sm">New orders from sales team awaiting designer assignment</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Job Title</TableHead>
                      <TableHead className="min-w-[120px]">Customer</TableHead>
                      <TableHead className="min-w-[120px]">Salesperson</TableHead>
                      <TableHead className="min-w-[90px]">Value</TableHead>
                      <TableHead className="min-w-[90px]">Invoice</TableHead>
                      <TableHead className="min-w-[90px]">Created</TableHead>
                      <TableHead className="min-w-[150px]">Action</TableHead>
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
                            {order.has_active_invoice ? (
                              <Badge variant="default">Invoice Active</Badge>
                            ) : order.has_draft_invoice ? (
                              <Badge variant="secondary">Draft - Needs Number</Badge>
                            ) : (
                              <Badge variant="outline">No Invoice</Badge>
                            )}
                          </TableCell>
                          <TableCell>{format(new Date(order.created_at), 'PP')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {order.has_active_invoice ? (
                                <Button 
                                  size="sm" 
                                  variant="secondary"
                                  disabled
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Invoice Active
                                </Button>
                              ) : order.has_draft_invoice ? (
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => loadDraftInvoiceForActivation(order)}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Assign Number
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
                                        // Pre-fill with one item from order value
                                        if (order.order_value) {
                                          setInvoiceItems([{ 
                                            description: order.job_title || 'Order Item', 
                                            quantity: 1, 
                                            unit_price: order.order_value, 
                                            amount: order.order_value,
                                            sale_type: 'unit',
                                            width_m: null,
                                            height_m: null,
                                            area_m2: null
                                          }]);
                                        }
                                      }}
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Create Invoice
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] flex flex-col">
                                    <DialogHeader className="flex-shrink-0">
                                      <DialogTitle>Create Invoice</DialogTitle>
                                      <DialogDescription>Create a new invoice for this order</DialogDescription>
                                    </DialogHeader>
                                    <div className="flex-1 overflow-y-auto pr-4">
                                    <div className="grid gap-4 py-4">
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
                                      
                                      {/* Invoice Items - Table Layout */}
                                      <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                          <Label>Invoice Items</Label>
                                          <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add Item
                                          </Button>
                                        </div>
                                        
                                        <div className="overflow-x-auto">
                                        <Table className="min-w-[800px]">
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[25%]">Product</TableHead>
                                              <TableHead className="w-[20%]">Description</TableHead>
                                              <TableHead className="w-[8%]">Unit</TableHead>
                                              <TableHead className="w-[6%]">Qty</TableHead>
                                              <TableHead className="w-[14%]">Size</TableHead>
                                              <TableHead className="w-[10%]">Rate</TableHead>
                                              <TableHead className="w-[12%]">Total</TableHead>
                                              <TableHead className="w-[5%]"></TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {invoiceItems.map((item, index) => {
                                              const isAreaBased = item.sale_type === 'area';
                                              const calculatedArea = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : 0;
                                              const quantity = item.quantity || 1;
                                              const lineTotal = isAreaBased 
                                                ? calculatedArea * quantity * item.unit_price 
                                                : item.quantity * item.unit_price;
                                              
                                              return (
                                                <TableRow key={index}>
                                                  <TableCell>
                                                    <Select
                                                      value={item.product_id || ''}
                                                      onValueChange={(value) => handleProductSelect(index, value)}
                                                    >
                                                      <SelectTrigger className="bg-background">
                                                        <SelectValue placeholder="Select" />
                                                      </SelectTrigger>
                                                      <SelectContent className="bg-background z-50">
                                                        {products.map((product) => (
                                                          <SelectItem key={product.id} value={product.id}>
                                                            {product.name} {product.sale_type === 'area' ? `($${product.selling_price_per_m2}/m²)` : `($${product.selling_price})`}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  </TableCell>
                                                  <TableCell>
                                                    <Input
                                                      value={item.description}
                                                      onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                                                      placeholder="Description"
                                                      required
                                                    />
                                                  </TableCell>
                                                  <TableCell>
                                                    <span className="text-sm text-muted-foreground">{item.retail_unit || 'piece'}</span>
                                                  </TableCell>
                                                  {/* Quantity column - always visible */}
                                                  <TableCell>
                                                    <Input
                                                      type="number"
                                                      min="1"
                                                      value={item.quantity}
                                                      onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                                      className="w-16"
                                                      required
                                                    />
                                                  </TableCell>
                                                  {/* Size column - only for area-based products */}
                                                  <TableCell>
                                                    {isAreaBased ? (
                                                      <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1">
                                                          <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0.01"
                                                            value={item.width_m || ''}
                                                            onChange={(e) => updateInvoiceItem(index, 'width_m', parseFloat(e.target.value) || 0)}
                                                            placeholder="W"
                                                            className="w-16"
                                                            required
                                                          />
                                                          <span className="text-xs text-muted-foreground">×</span>
                                                          <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0.01"
                                                            value={item.height_m || ''}
                                                            onChange={(e) => updateInvoiceItem(index, 'height_m', parseFloat(e.target.value) || 0)}
                                                            placeholder="H"
                                                            className="w-16"
                                                            required
                                                          />
                                                          <span className="text-xs text-muted-foreground">m</span>
                                                        </div>
                                                        <span className="text-xs text-primary font-medium">
                                                          = {calculatedArea.toFixed(2)} m² × {quantity} = {(calculatedArea * quantity).toFixed(2)} m²
                                                        </span>
                                                      </div>
                                                    ) : (
                                                      <span className="text-xs text-muted-foreground">-</span>
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    <div className="flex flex-col">
                                                      <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="min-w-[80px]"
                                                        value={item.unit_price}
                                                        onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                        required
                                                      />
                                                      {isAreaBased && (
                                                        <span className="text-xs text-muted-foreground">/m²</span>
                                                      )}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell className="font-semibold">
                                                    ${lineTotal.toFixed(2)}
                                                  </TableCell>
                                                  <TableCell>
                                                    {invoiceItems.length > 1 && (
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeInvoiceItem(index)}
                                                      >
                                                        ×
                                                      </Button>
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                        </div>

                                        <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                                          <span className="font-semibold">Subtotal:</span>
                                          <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
                                        </div>
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
                                      
                                      <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                                        <span className="font-semibold text-lg">Total:</span>
                                        <span className="text-2xl font-bold">
                                          ${(calculateInvoiceSubtotal() + (parseFloat(invoiceTax) || 0)).toFixed(2)}
                                        </span>
                                      </div>
                                      
                                      <div className="grid gap-2">
                                        <Label htmlFor="workflow-project-name">Project Name</Label>
                                        <Input
                                          id="workflow-project-name"
                                          value={invoiceProjectName}
                                          onChange={(e) => setInvoiceProjectName(e.target.value)}
                                          placeholder="Enter project name"
                                        />
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
                                    </div>
                                    <DialogFooter className="flex-shrink-0 pt-4 border-t">
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
              <CardContent className="overflow-x-auto -mx-4 sm:mx-0">
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
                                <>
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
                                  <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => {
                                      setSelectedOrderForDebt(order);
                                      setDebtDialogOpen(true);
                                    }}
                                  >
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                    Record as Debt
                                  </Button>
                                </>
                              )}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="sm">
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Send to Print
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64" align="start">
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label>Select Print Operator</Label>
                                      <Select
                                        value={selectedOrderForPrintAssignment === order.id ? selectedPrintOperator : ''}
                                        onValueChange={(value) => {
                                          setSelectedOrderForPrintAssignment(order.id);
                                          setSelectedPrintOperator(value);
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Choose operator..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {printOperators.map((op) => (
                                            <SelectItem key={op.id} value={op.id}>
                                              {op.full_name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="w-full"
                                      disabled={selectedOrderForPrintAssignment !== order.id || !selectedPrintOperator}
                                      onClick={() => handleApproveAndSendToPrint(order.id, selectedPrintOperator)}
                                    >
                                      Assign & Send
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
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
              <CardContent className="overflow-x-auto -mx-4 sm:mx-0">
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
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg">Invoices</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Manage customer invoices</CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                    <Select value={invoiceFilterCustomer} onValueChange={setInvoiceFilterCustomer}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Filter by customer" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All Customers</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => setCreateInvoiceDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Invoice
                      </Button>
                  <Dialog open={createInvoiceDialogOpen} onOpenChange={setCreateInvoiceDialogOpen}>
                    <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] flex flex-col">
                      <DialogHeader className="flex-shrink-0">
                        <DialogTitle>Create Invoice</DialogTitle>
                        <DialogDescription>Create a new invoice for a customer</DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 overflow-y-auto pr-4">
                      <div className="grid gap-4 py-4">
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
                        
                        {/* Invoice Items - Table Layout */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <Label>Invoice Items</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add Item
                            </Button>
                          </div>
                          
                          <div className="overflow-x-auto">
                          <Table className="min-w-[800px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[22%]">Product</TableHead>
                                <TableHead className="w-[18%]">Description</TableHead>
                                <TableHead className="w-[8%]">Unit</TableHead>
                                <TableHead className="w-[6%]">Qty</TableHead>
                                <TableHead className="w-[14%]">Size</TableHead>
                                <TableHead className="w-[10%]">Rate</TableHead>
                                <TableHead className="w-[12%]">Total</TableHead>
                                <TableHead className="w-[5%]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {invoiceItems.map((item, index) => {
                                const isAreaBased = item.sale_type === 'area';
                                const calculatedArea = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : 0;
                                const quantity = item.quantity || 1;
                                const lineTotal = isAreaBased 
                                  ? calculatedArea * quantity * item.unit_price 
                                  : item.quantity * item.unit_price;
                                
                                return (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <Select
                                        value={item.product_id || ''}
                                        onValueChange={(value) => handleProductSelect(index, value)}
                                      >
                                        <SelectTrigger className="bg-background">
                                          <SelectValue placeholder="Select product" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-background z-50">
                                          {products.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                              {product.name} {product.sale_type === 'area' ? `($${product.selling_price_per_m2}/m²)` : `($${product.selling_price})`}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={item.description}
                                        onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                                        placeholder="Description"
                                        required
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <span className="text-sm text-muted-foreground">{item.retail_unit || 'piece'}</span>
                                    </TableCell>
                                    {/* Quantity column - always visible */}
                                    <TableCell>
                                      <Input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-16"
                                        required
                                      />
                                    </TableCell>
                                    {/* Size column - only for area-based products */}
                                    <TableCell>
                                      {isAreaBased ? (
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0.01"
                                              value={item.width_m || ''}
                                              onChange={(e) => updateInvoiceItem(index, 'width_m', parseFloat(e.target.value) || 0)}
                                              placeholder="W"
                                              className="w-16"
                                              required
                                            />
                                            <span className="text-xs text-muted-foreground">×</span>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0.01"
                                              value={item.height_m || ''}
                                              onChange={(e) => updateInvoiceItem(index, 'height_m', parseFloat(e.target.value) || 0)}
                                              placeholder="H"
                                              className="w-16"
                                              required
                                            />
                                            <span className="text-xs text-muted-foreground">m</span>
                                          </div>
                                          <span className="text-xs text-primary font-medium">
                                            = {calculatedArea.toFixed(2)} m² × {quantity} = {(calculatedArea * quantity).toFixed(2)} m²
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col">
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          className="min-w-[80px]"
                                          value={item.unit_price}
                                          onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                          required
                                        />
                                        {isAreaBased && (
                                          <span className="text-xs text-muted-foreground">/m²</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-semibold">
                                      ${lineTotal.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                      {invoiceItems.length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeInvoiceItem(index)}
                                        >
                                          ×
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          </div>

                          <div className="flex justify-end pt-4 border-t">
                            <div className="text-right space-y-2">
                              <div className="flex justify-between items-center gap-4">
                                <span className="font-semibold">Subtotal:</span>
                                <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center gap-4 text-success">
                                <span className="text-sm font-medium">Est. Profit:</span>
                                <span className="font-bold">${calculateTotalProfit().toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
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
                        
                        <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                          <span className="font-semibold text-lg">Total:</span>
                          <span className="text-2xl font-bold">
                            ${(calculateInvoiceSubtotal() + (parseFloat(invoiceTax) || 0)).toFixed(2)}
                          </span>
                        </div>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="project-name">Project Name</Label>
                          <Input
                            id="project-name"
                            value={invoiceProjectName}
                            onChange={(e) => setInvoiceProjectName(e.target.value)}
                            placeholder="Enter project name"
                          />
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
                      </div>
                      <DialogFooter className="flex-shrink-0 pt-4 border-t">
                        <Button onClick={handleCreateInvoice}>Create Invoice</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Invoice #</TableHead>
                      <TableHead className="min-w-[150px]">Customer</TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[100px]">Due Date</TableHead>
                      <TableHead className="min-w-[100px]">Total</TableHead>
                      <TableHead className="min-w-[80px]">Paid</TableHead>
                      <TableHead className="min-w-[80px]">Outstanding</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.filter(invoice => 
                      invoiceFilterCustomer === 'all' || invoice.customer_id === invoiceFilterCustomer
                    ).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices
                        .filter(invoice => 
                          invoiceFilterCustomer === 'all' || invoice.customer_id === invoiceFilterCustomer
                        )
                        .map((invoice) => {
                          const outstanding = invoice.total_amount - invoice.amount_paid;
                          return (
                          <>
                            <TableRow 
                              key={invoice.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedInvoiceId(expandedInvoiceId === invoice.id ? null : invoice.id)}
                            >
                              <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                              <TableCell>{invoice.customer.name}</TableCell>
                              <TableCell>{format(new Date(invoice.invoice_date), 'PP')}</TableCell>
                              <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'PP') : '-'}</TableCell>
                              <TableCell>${invoice.total_amount.toFixed(2)}</TableCell>
                              <TableCell className="text-green-600 font-medium">${invoice.amount_paid.toFixed(2)}</TableCell>
                              <TableCell className={outstanding > 0 ? "text-orange-600 font-medium" : "text-green-600"}>
                                ${outstanding.toFixed(2)}
                              </TableCell>
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
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-2">
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditInvoice(invoice)}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </Button>
                                  {invoice.status !== 'paid' && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => {
                                        setSelectedInvoiceForPayment(invoice);
                                        setInvoicePaymentDialogOpen(true);
                                      }}
                                    >
                                      <DollarSign className="mr-2 h-4 w-4" />
                                      Record Payment
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            {expandedInvoiceId === invoice.id && (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-muted/30">
                                  <div className="p-4 space-y-4">
                                    <h4 className="font-semibold text-sm">Invoice Items</h4>
                                    <div className="border rounded-lg overflow-hidden">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Description</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Unit Price</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                                            <>
                                              {invoice.invoice_items.map((item: any, idx: number) => (
                                                <TableRow key={idx}>
                                                  <TableCell>{item.description}</TableCell>
                                                  <TableCell className="text-right">{item.quantity}</TableCell>
                                                  <TableCell className="text-right">${item.unit_price.toFixed(2)}</TableCell>
                                                  <TableCell className="text-right font-medium">${item.amount.toFixed(2)}</TableCell>
                                                </TableRow>
                                              ))}
                                              <TableRow className="bg-muted/50">
                                                <TableCell colSpan={3} className="text-right font-semibold">Subtotal:</TableCell>
                                                <TableCell className="text-right font-semibold">${(invoice.subtotal || 0).toFixed(2)}</TableCell>
                                              </TableRow>
                                              {(invoice.tax_amount || 0) > 0 && (
                                                <TableRow className="bg-muted/50">
                                                  <TableCell colSpan={3} className="text-right font-semibold">Tax:</TableCell>
                                                  <TableCell className="text-right font-semibold">${(invoice.tax_amount || 0).toFixed(2)}</TableCell>
                                                </TableRow>
                                              )}
                                              <TableRow className="bg-primary/10">
                                                <TableCell colSpan={3} className="text-right font-bold text-lg">Total:</TableCell>
                                                <TableCell className="text-right font-bold text-lg">${invoice.total_amount.toFixed(2)}</TableCell>
                                              </TableRow>
                                            </>
                                          ) : (
                                            <TableRow>
                                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                                No items found
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );})
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
              <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-0">
                {/* Customer Search Filter */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Input
                    placeholder="Search customers by name, email, phone, or company..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="h-9"
                  />
                </div>

                {(() => {
                  let filteredCustomers = customers;
                  if (customerSearchQuery.trim()) {
                    const query = customerSearchQuery.toLowerCase();
                    filteredCustomers = customers.filter((c) =>
                      (c.name || '').toLowerCase().includes(query) ||
                      (c.email || '').toLowerCase().includes(query) ||
                      (c.phone || '').toLowerCase().includes(query) ||
                      (c.company_name || '').toLowerCase().includes(query)
                    );
                  }

                  return (
                    <>
                      <div className="text-sm text-muted-foreground px-1">
                        {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} found
                      </div>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                            {filteredCustomers.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                  No customers found
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredCustomers.map((customer) => (
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
                    </>
                  );
                })()}
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const paymentsToExport = paymentFilterMode === 'global' ? payments :
                          paymentFilterMode === 'all' ? allPayments :
                          allPayments.filter((p: any) => {
                            const pDate = new Date(p.payment_date);
                            return pDate >= paymentCustomStartDate && pDate <= paymentCustomEndDate;
                          });
                        generatePaymentsReportPDF(paymentsToExport, {
                          dateFrom: paymentFilterMode === 'global' ? startDate : paymentFilterMode === 'custom' ? paymentCustomStartDate : undefined,
                          dateTo: paymentFilterMode === 'global' ? endDate : paymentFilterMode === 'custom' ? paymentCustomEndDate : undefined,
                        });
                        toast({
                          title: 'Success',
                          description: 'Payments report downloaded',
                        });
                      }}
                      className="shrink-0"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
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
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-0 relative z-10">
                {/* Payment Filters */}
                <div className="flex flex-col gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={paymentFilterMode === 'global' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentFilterMode('global')}
                    >
                      Dashboard Range
                    </Button>
                    <Button
                      variant={paymentFilterMode === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentFilterMode('custom')}
                    >
                      Custom Range
                    </Button>
                    <Button
                      variant={paymentFilterMode === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPaymentFilterMode('all')}
                    >
                      All Time
                    </Button>
                  </div>

                  {paymentFilterMode === 'custom' && (
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">From</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !paymentCustomStartDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {paymentCustomStartDate ? format(paymentCustomStartDate, 'PP') : 'Start date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={paymentCustomStartDate}
                              onSelect={(date) => date && setPaymentCustomStartDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !paymentCustomEndDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {paymentCustomEndDate ? format(paymentCustomEndDate, 'PP') : 'End date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={paymentCustomEndDate}
                              onSelect={(date) => date && setPaymentCustomEndDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        placeholder="Search payments by customer, order, receipt..."
                        value={paymentSearchQuery}
                        onChange={(e) => setPaymentSearchQuery(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="min-w-[150px]">
                      <Select value={paymentFilterMethod} onValueChange={setPaymentFilterMethod}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="All Methods" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Methods</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="mobile_money">Mobile Money</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Payments Table */}
                {(() => {
                  let basePayments = paymentFilterMode === 'global' ? payments :
                    paymentFilterMode === 'all' ? allPayments :
                    allPayments.filter((p: any) => {
                      const pDate = new Date(p.payment_date);
                      return pDate >= paymentCustomStartDate && pDate <= endOfDay(paymentCustomEndDate);
                    });

                  // Apply method filter
                  if (paymentFilterMethod !== 'all') {
                    basePayments = basePayments.filter((p: any) => p.payment_method === paymentFilterMethod);
                  }

                  // Apply search filter
                  if (paymentSearchQuery.trim()) {
                    const query = paymentSearchQuery.toLowerCase();
                    basePayments = basePayments.filter((p: any) =>
                      (p.order?.job_title || '').toLowerCase().includes(query) ||
                      (p.order?.customer?.name || '').toLowerCase().includes(query) ||
                      (p.invoice?.invoice_number || '').toLowerCase().includes(query) ||
                      (p.invoice?.customer?.name || '').toLowerCase().includes(query) ||
                      (p.reference_number || '').toLowerCase().includes(query) ||
                      (p.notes || '').toLowerCase().includes(query)
                    );
                  }

                  const filteredTotal = basePayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

                  return (
                    <>
                      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                        <span>{basePayments.length} payment{basePayments.length !== 1 ? 's' : ''} found</span>
                        <span className="font-medium text-foreground">Total: ${filteredTotal.toFixed(2)}</span>
                      </div>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                            {basePayments.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                  No payments found for the selected filters
                                </TableCell>
                              </TableRow>
                            ) : (
                              basePayments.map((payment: any) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{format(new Date(payment.payment_date), 'PP')}</TableCell>
                                  <TableCell>
                                    {payment.order?.job_title || payment.invoice?.invoice_number || 'N/A'}
                                  </TableCell>
                                  <TableCell>
                                    {payment.order?.customer?.name || payment.invoice?.customer?.name || 'N/A'}
                                  </TableCell>
                                  <TableCell className="font-medium">${payment.amount.toFixed(2)}</TableCell>
                                  <TableCell className="capitalize">{payment.payment_method.replace('_', ' ')}</TableCell>
                                  <TableCell>{payment.reference_number || '-'}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Dialog - Allocation-based payment system */}
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Record Customer Payment</DialogTitle>
                <DialogDescription>Allocate payment across customer's outstanding invoices</DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-auto">
                <ScrollArea className="h-full">
                  <div className="grid gap-4 py-4 pr-4">
                <div className="grid gap-2">
                  <Label htmlFor="payment-customer">Customer *</Label>
                  <Select value={paymentCustomer} onValueChange={(value) => {
                    setPaymentCustomer(value);
                    handleOpenAddPayment(value);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} {customer.company_name ? `(${customer.company_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {customerInvoices.length > 0 && (
                  <div className="bg-muted p-4 rounded-lg space-y-3">
                    <h4 className="font-semibold">Select Invoices to Pay</h4>
                    <p className="text-sm text-muted-foreground">Check invoices and enter payment amounts (supports partial payments)</p>
                    {customerInvoices.map((invoice) => {
                      const outstanding = invoice.total_amount - invoice.amount_paid;
                      const allocation = paymentAllocation.find(alloc => alloc.invoiceId === invoice.id);
                      const isSelected = allocation?.selected || false;
                      
                      return (
                        <div key={invoice.id} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`invoice-${invoice.id}`}
                              checked={isSelected}
                              onCheckedChange={() => handleToggleInvoiceSelection(invoice.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-2">
                              <label 
                                htmlFor={`invoice-${invoice.id}`}
                                className="flex justify-between items-start cursor-pointer"
                              >
                                <div>
                                  <p className="font-medium">{invoice.invoice_number}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Due: {new Date(invoice.due_date || invoice.invoice_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <p className="text-sm font-medium">${outstanding.toFixed(2)} outstanding</p>
                              </label>
                              
                              {isSelected && allocation && (
                                <div className="space-y-3 pt-2">
                                  {/* Discount Section */}
                                  <div className="border rounded-lg p-3 space-y-2 bg-orange-50 dark:bg-orange-950/20">
                                    <Label className="text-xs font-medium">Payment Discount (Optional)</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Discount Type</Label>
                                        <Select 
                                          value={allocation.discountType} 
                                          onValueChange={(v) => handleInvoiceDiscountTypeChange(invoice.id, v as 'fixed' | 'percentage')}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                          {allocation.discountType === 'percentage' ? 'Percentage' : 'Amount'}
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          max={allocation.discountType === 'percentage' ? 100 : outstanding}
                                          value={allocation.discountValue || ''}
                                          onChange={(e) => handleInvoiceDiscountValueChange(invoice.id, e.target.value)}
                                          placeholder={allocation.discountType === 'percentage' ? '0%' : '0.00'}
                                          className="h-8"
                                        />
                                      </div>
                                    </div>
                                    {allocation.discountValue > 0 && (
                                      <>
                                        <p className="text-xs text-orange-700 dark:text-orange-300">
                                          Discount: <strong>${calculateDiscountAmount(allocation, invoice).toFixed(2)}</strong>
                                        </p>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">Discount Reason (Optional)</Label>
                                          <Input
                                            value={allocation.discountReason}
                                            onChange={(e) => handleInvoiceDiscountReasonChange(invoice.id, e.target.value)}
                                            placeholder="e.g., Early payment, Loyalty discount"
                                            className="h-8"
                                          />
                                        </div>
                                      </>
                                    )}
                                    <p className="text-xs font-medium text-success">
                                      Payable After Discount: <strong>${calculatePayableAfterDiscount(allocation, invoice).toFixed(2)}</strong>
                                    </p>
                                  </div>

                                  {/* Payment Amount */}
                                  <div className="space-y-1">
                                    <Label htmlFor={`amount-${invoice.id}`} className="text-sm">Amount Received *</Label>
                                    <Input
                                      id={`amount-${invoice.id}`}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={calculatePayableAfterDiscount(allocation, invoice)}
                                      value={allocation.amount || ''}
                                      onChange={(e) => handleInvoicePaymentAmountChange(invoice.id, e.target.value)}
                                      placeholder="0.00"
                                      className="h-9"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Max payable: ${calculatePayableAfterDiscount(allocation, invoice).toFixed(2)}
                                    </p>
                                    {allocation.amount > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        Will be marked as: {(allocation.amount + calculateDiscountAmount(allocation, invoice)) >= outstanding ? 'Paid' : 'Partial'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {paymentAllocation.filter(a => a.selected && a.amount > 0).length > 0 && (
                      <div className="pt-2 border-t border-border space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Total Payment:</span>
                          <span className="font-medium">${paymentAllocation.filter(a => a.selected).reduce((sum, alloc) => sum + alloc.amount, 0).toFixed(2)}</span>
                        </div>
                        {paymentAllocation.filter(a => a.selected && a.discountValue > 0).length > 0 && (
                          <div className="flex justify-between text-sm text-orange-600">
                            <span>Total Discount:</span>
                            <span className="font-medium">
                              ${paymentAllocation.filter(a => a.selected).reduce((sum, alloc) => {
                                const invoice = customerInvoices.find(inv => inv.id === alloc.invoiceId);
                                if (!invoice) return sum;
                                return sum + calculateDiscountAmount(alloc, invoice);
                              }, 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold pt-1 border-t">
                          <span>Total Credited:</span>
                          <span>
                            ${paymentAllocation.filter(a => a.selected).reduce((sum, alloc) => {
                              const invoice = customerInvoices.find(inv => inv.id === alloc.invoiceId);
                              if (!invoice) return sum + alloc.amount;
                              return sum + alloc.amount + calculateDiscountAmount(alloc, invoice);
                            }, 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {paymentCustomer && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="payment-method">Payment Method *</Label>
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
                      <Label htmlFor="payment-reference">Receipt Number *</Label>
                      <Input
                        id="payment-reference"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Enter receipt/reference number"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="payment-notes">Notes</Label>
                      <Textarea
                        id="payment-notes"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Additional notes (optional)"
                        rows={3}
                      />
                    </div>
                  </>
                )}
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter className="mt-2 flex-shrink-0">
                <Button variant="outline" onClick={() => {
                  setPaymentDialogOpen(false);
                  setPaymentCustomer('');
                  setPaymentAmount('');
                  setPaymentMethod('cash');
                  setPaymentReference('');
                  setPaymentNotes('');
                  setCustomerInvoices([]);
                  setPaymentAllocation([]);
                }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleRecordPayment}
                  disabled={
                    !paymentCustomer || 
                    paymentAllocation.filter(a => a.selected && a.amount > 0).length === 0 || 
                    !paymentMethod || 
                    !paymentReference
                  }
                >
                  Record Payment
                </Button>
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const expensesToExport = expenseFilterMode === 'global' ? expenses : 
                          expenseFilterMode === 'all' ? allExpenses :
                          allExpenses.filter(e => {
                            const eDate = new Date(e.expense_date);
                            return eDate >= expenseCustomStartDate && eDate <= expenseCustomEndDate;
                          });
                        generateExpensesReportPDF(expensesToExport, {
                          dateFrom: expenseFilterMode === 'global' ? startDate : expenseFilterMode === 'custom' ? expenseCustomStartDate : undefined,
                          dateTo: expenseFilterMode === 'global' ? endDate : expenseFilterMode === 'custom' ? expenseCustomEndDate : undefined,
                        });
                        toast({
                          title: 'Success',
                          description: 'Expenses report downloaded',
                        });
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Record Expense
                        </Button>
                      </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Expense Filters */}
                <div className="flex flex-col gap-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={expenseFilterMode === 'global' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterMode('global')}
                    >
                      Dashboard Range
                    </Button>
                    <Button
                      variant={expenseFilterMode === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterMode('custom')}
                    >
                      Custom Range
                    </Button>
                    <Button
                      variant={expenseFilterMode === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setExpenseFilterMode('all')}
                    >
                      All Time
                    </Button>
                  </div>
                  
                  {expenseFilterMode === 'custom' && (
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">From</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !expenseCustomStartDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {expenseCustomStartDate ? format(expenseCustomStartDate, 'PP') : 'Start date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={expenseCustomStartDate}
                              onSelect={(date) => date && setExpenseCustomStartDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !expenseCustomEndDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {expenseCustomEndDate ? format(expenseCustomEndDate, 'PP') : 'End date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={expenseCustomEndDate}
                              onSelect={(date) => date && setExpenseCustomEndDate(date)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        placeholder="Search expenses..."
                        value={expenseSearchQuery}
                        onChange={(e) => setExpenseSearchQuery(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="min-w-[150px]">
                      <Select value={expenseFilterCategory} onValueChange={setExpenseFilterCategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {[...new Set((expenseFilterMode === 'global' ? expenses : allExpenses).map((e: any) => e.category).filter(Boolean))].sort().map((cat: string) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Expenses Table */}
                {(() => {
                  // Determine base expenses based on filter mode
                  let baseExpenses = expenseFilterMode === 'global' ? expenses : 
                    expenseFilterMode === 'all' ? allExpenses :
                    allExpenses.filter(e => {
                      const eDate = new Date(e.expense_date);
                      return eDate >= expenseCustomStartDate && eDate <= endOfDay(expenseCustomEndDate);
                    });

                  // Apply category filter
                  if (expenseFilterCategory !== 'all') {
                    baseExpenses = baseExpenses.filter((e: any) => e.category === expenseFilterCategory);
                  }

                  // Apply search filter
                  if (expenseSearchQuery.trim()) {
                    const query = expenseSearchQuery.toLowerCase();
                    baseExpenses = baseExpenses.filter((e: any) =>
                      (e.description || '').toLowerCase().includes(query) ||
                      (e.category || '').toLowerCase().includes(query) ||
                      (e.supplier_name || '').toLowerCase().includes(query) ||
                      (e.notes || '').toLowerCase().includes(query)
                    );
                  }

                  const filteredTotal = baseExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

                  return (
                    <>
                      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                        <span>{baseExpenses.length} expense{baseExpenses.length !== 1 ? 's' : ''} found</span>
                        <span className="font-medium text-foreground">Total: ${filteredTotal.toFixed(2)}</span>
                      </div>
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                            {baseExpenses.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                  No expenses found for the selected filters
                                </TableCell>
                              </TableRow>
                            ) : (
                              baseExpenses.map((expense: any) => (
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
                    </>
                  );
                })()}
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
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">User</TableHead>
                      <TableHead className="min-w-[100px]">Type</TableHead>
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
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No commissions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      commissions.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell className="font-medium">{commission.user.full_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {commission.commission_type === 'sales' ? 'Sales' : 
                               commission.commission_type === 'design' ? 'Design' : 'Print'}
                            </Badge>
                          </TableCell>
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
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">User</TableHead>
                            <TableHead className="min-w-[100px]">Type</TableHead>
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
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                No commissions found for the selected period
                              </TableCell>
                            </TableRow>
                          ) : (
                            commissions.map((commission) => (
                              <TableRow key={commission.id}>
                                <TableCell className="font-medium">{commission.user.full_name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {commission.commission_type === 'sales' ? 'Sales' : 
                                     commission.commission_type === 'design' ? 'Design' : 'Print'}
                                  </Badge>
                                </TableCell>
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
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                                  {payment.order?.customer?.name || payment.invoice?.customer?.name || '-'}
                                </TableCell>
                                <TableCell>
                                  {payment.order?.job_title || payment.invoice?.invoice_number || '-'}
                                </TableCell>
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

      {/* Invoice Payment Recording Dialog */}
      <Dialog open={invoicePaymentDialogOpen} onOpenChange={setInvoicePaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Record Invoice Payment</DialogTitle>
            <DialogDescription>
              Record a payment received for invoice {selectedInvoiceForPayment?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <ScrollArea className="h-full">
              {selectedInvoiceForPayment && (() => {
                const invoiceBalance = selectedInvoiceForPayment.total_amount - selectedInvoiceForPayment.amount_paid;
                const discountValue = parseFloat(invoicePaymentDiscountValue) || 0;
                const discountAmount = invoicePaymentDiscountType === 'percentage' 
                  ? (invoiceBalance * discountValue) / 100 
                  : discountValue;
                const payableAmount = Math.max(0, invoiceBalance - discountAmount);
                
                return (
                  <div className="space-y-4 pr-4">
                    <div className="bg-muted p-3 rounded-md space-y-1">
                      <p className="text-sm"><strong>Invoice:</strong> {selectedInvoiceForPayment.invoice_number}</p>
                      <p className="text-sm"><strong>Customer:</strong> {selectedInvoiceForPayment.customer?.name}</p>
                      <p className="text-sm"><strong>Total Amount:</strong> ${selectedInvoiceForPayment.total_amount.toFixed(2)}</p>
                      <p className="text-sm"><strong>Amount Paid:</strong> ${selectedInvoiceForPayment.amount_paid.toFixed(2)}</p>
                      <p className="text-sm font-medium text-destructive">
                        <strong>Outstanding Balance:</strong> ${invoiceBalance.toFixed(2)}
                      </p>
                    </div>
                    
                    {/* Discount Section */}
                    <div className="border rounded-lg p-3 space-y-3 bg-orange-50 dark:bg-orange-950/20">
                      <Label className="text-sm font-medium">Payment Discount (Optional)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Discount Type</Label>
                          <Select 
                            value={invoicePaymentDiscountType} 
                            onValueChange={(v) => setInvoicePaymentDiscountType(v as 'fixed' | 'percentage')}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            {invoicePaymentDiscountType === 'percentage' ? 'Percentage' : 'Amount'}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={invoicePaymentDiscountType === 'percentage' ? 100 : invoiceBalance}
                            value={invoicePaymentDiscountValue}
                            onChange={(e) => setInvoicePaymentDiscountValue(e.target.value)}
                            placeholder={invoicePaymentDiscountType === 'percentage' ? '0%' : '0.00'}
                          />
                        </div>
                      </div>
                      {discountAmount > 0 && (
                        <>
                          <p className="text-sm text-orange-700 dark:text-orange-300">
                            Discount: <strong>${discountAmount.toFixed(2)}</strong>
                          </p>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Discount Reason (Optional)</Label>
                            <Input
                              value={invoicePaymentDiscountReason}
                              onChange={(e) => setInvoicePaymentDiscountReason(e.target.value)}
                              placeholder="e.g., Early payment, Loyalty discount"
                            />
                          </div>
                        </>
                      )}
                      <p className="text-sm font-medium text-success">
                        Payable After Discount: <strong>${payableAmount.toFixed(2)}</strong>
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="invoice-payment-amount">Amount Received *</Label>
                      <Input
                        id="invoice-payment-amount"
                        type="number"
                        step="0.01"
                        value={invoicePaymentAmount}
                        onChange={(e) => setInvoicePaymentAmount(e.target.value)}
                        placeholder="0.00"
                        max={payableAmount}
                      />
                      <p className="text-xs text-muted-foreground">
                        Max payable: ${payableAmount.toFixed(2)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoice-payment-method">Payment Method *</Label>
                      <Select value={invoicePaymentMethod} onValueChange={setInvoicePaymentMethod}>
                        <SelectTrigger id="invoice-payment-method">
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

                    <div className="space-y-2">
                      <Label htmlFor="invoice-payment-reference">Receipt/Reference Number *</Label>
                      <Input
                        id="invoice-payment-reference"
                        value={invoicePaymentReference}
                        onChange={(e) => setInvoicePaymentReference(e.target.value)}
                        placeholder="Enter receipt or reference number"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="invoice-payment-notes">Notes (Optional)</Label>
                      <Textarea
                        id="invoice-payment-notes"
                        value={invoicePaymentNotes}
                        onChange={(e) => setInvoicePaymentNotes(e.target.value)}
                        placeholder="Additional notes about this payment"
                      />
                    </div>
                  </div>
                );
              })()}
            </ScrollArea>
          </div>
          <DialogFooter className="mt-2 flex-shrink-0">
            <Button variant="outline" onClick={() => {
              setInvoicePaymentDialogOpen(false);
              setInvoicePaymentDiscountType('fixed');
              setInvoicePaymentDiscountValue('');
              setInvoicePaymentDiscountReason('');
            }}>
              Cancel
            </Button>
            <Button onClick={handleRecordInvoicePayment}>
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debt Recording Dialog */}
      <Dialog open={debtDialogOpen} onOpenChange={setDebtDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record as Outstanding Debt</DialogTitle>
            <DialogDescription>
              Mark this order as unpaid debt. Invoice must be created first.
            </DialogDescription>
          </DialogHeader>
          {selectedOrderForDebt && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order:</span>
                    <span className="font-medium">{selectedOrderForDebt.job_title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{selectedOrderForDebt.customers?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Value:</span>
                    <span className="font-medium">${selectedOrderForDebt.order_value?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="debt-notes">Notes (Optional)</Label>
                <Textarea
                  id="debt-notes"
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  placeholder="Add notes about why this is being recorded as debt..."
                  rows={4}
                />
              </div>

              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-700">
                    This will mark the order as outstanding debt and allow it to proceed to printing.
                    Make sure an invoice has been created for this order first.
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDebtDialogOpen(false);
              setSelectedOrderForDebt(null);
              setDebtNotes('');
            }}>
              Cancel
            </Button>
            <Button onClick={handleRecordDebt} variant="secondary">
              Record as Debt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        order={selectedOrderForInvoice || selectedInvoiceForView}
      />

      {/* Edit Invoice Dialog */}
      <Dialog open={editInvoiceDialogOpen} onOpenChange={setEditInvoiceDialogOpen}>
        <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>Update invoice details and items</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-invoice-number">Invoice Number *</Label>
              <Input
                id="edit-invoice-number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-00001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-invoice-customer">Customer *</Label>
              <Select value={invoiceCustomer} onValueChange={setInvoiceCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
              />
            </div>
            
            {/* Invoice Items */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>Invoice Items (Retail Units Only)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              
              {invoiceItems.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>Product (Optional)</Label>
                      <Select 
                        value={item.product_id || ''} 
                        onValueChange={(value) => handleProductSelect(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product or type manually" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} - ${product.selling_price.toFixed(2)}/{product.retail_unit} (Stock: {product.stock_quantity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Description *</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                        placeholder="Item description"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="grid gap-2">
                        <Label>Qty ({item.retail_unit || 'unit'})</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Unit Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          disabled={!!item.product_id}
                          className={item.product_id ? 'bg-muted' : ''}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          value={item.amount.toFixed(2)}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Profit</Label>
                        <Input
                          type="number"
                          value={(item.line_profit || 0).toFixed(2)}
                          disabled
                          className="bg-muted text-success"
                        />
                      </div>
                    </div>
                    {item.product_id && (
                      <div className="text-xs text-muted-foreground">
                        Cost: ${(item.cost_per_unit || 0).toFixed(2)}/{item.retail_unit} | 
                        Line Cost: ${(item.line_cost || 0).toFixed(2)} | 
                        Profit: ${(item.line_profit || 0).toFixed(2)}
                      </div>
                    )}
                    {invoiceItems.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeInvoiceItem(index)}
                      >
                        Remove Item
                      </Button>
                    )}
                  </div>
                </Card>
              ))}

              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="font-semibold">Subtotal:</span>
                  <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-success/10 rounded-lg">
                  <span className="text-sm text-success font-medium">Est. Profit (internal):</span>
                  <span className="text-success font-bold">${calculateTotalProfit().toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-tax">Tax Amount</Label>
              <Input
                id="edit-tax"
                type="number"
                value={invoiceTax}
                onChange={(e) => setInvoiceTax(e.target.value)}
                placeholder="0.00"
              />
            </div>
            
            <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
              <span className="font-semibold text-lg">Total:</span>
              <span className="text-2xl font-bold">
                ${(calculateInvoiceSubtotal() + (parseFloat(invoiceTax) || 0)).toFixed(2)}
              </span>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-project-name">Project Name</Label>
              <Input
                id="edit-project-name"
                value={invoiceProjectName}
                onChange={(e) => setInvoiceProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-invoice-notes">Notes</Label>
              <Input
                id="edit-invoice-notes"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditInvoiceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateInvoice}>Update Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Invoice Number Dialog for Draft Invoices */}
      <Dialog open={assignNumberDialogOpen} onOpenChange={setAssignNumberDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Assign Invoice Number</DialogTitle>
            <DialogDescription>
              Review the draft invoice and assign an official invoice number to activate it
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto max-h-[60vh]">
            <div className="grid gap-2">
              <Label htmlFor="assign-invoice-number">Invoice Number *</Label>
              <Input
                id="assign-invoice-number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-00001"
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the official invoice number to activate this draft
              </p>
            </div>

            {/* Invoice Items Preview */}
            <div className="space-y-4">
              <Label>Invoice Items</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Qty/Size</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceItems.map((item, index) => {
                    const isAreaBased = item.sale_type === 'area';
                    const area = isAreaBased ? (item.width_m || 0) * (item.height_m || 0) : 0;
                    const lineTotal = isAreaBased ? area * item.unit_price : item.quantity * item.unit_price;
                    
                    return (
                      <TableRow key={index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-center">
                          {isAreaBased ? (
                            <div className="text-xs">
                              <div>{(item.width_m || 0).toFixed(2)} × {(item.height_m || 0).toFixed(2)} m</div>
                              <div className="font-semibold">{area.toFixed(2)} m²</div>
                            </div>
                          ) : (
                            `${item.quantity} ${item.retail_unit || 'unit'}`
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          ${item.unit_price.toFixed(2)}{isAreaBased ? '/m²' : ''}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${lineTotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="font-semibold">Subtotal:</span>
                <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assign-due-date">Due Date</Label>
              <Input
                id="assign-due-date"
                type="date"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assign-notes">Notes</Label>
              <Textarea
                id="assign-notes"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAssignNumberDialogOpen(false);
              setActivatingDraftInvoice(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleActivateDraftInvoice}>
              Activate Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Required Dialog - Forces invoice creation before status change */}
      <Dialog open={invoiceRequiredDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setInvoiceRequiredDialogOpen(false);
          setPendingStatusChange(null);
          setNewCustomerName('');
          setNewCustomerEmail('');
          setNewCustomerPhone('');
          setNewCustomerCompany('');
          setSelectedCustomerForRequest('');
          setCreateCustomerForRequest(false);
          setLinkExistingInvoice(false);
          setSelectedExistingInvoice('');
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Invoice Required
            </DialogTitle>
            <DialogDescription>
              Before processing this request, you must link or create an invoice.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 max-h-[60vh]">
            <div className="space-y-6 pr-4">
              {/* Request Details */}
              {pendingStatusChange && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Request Details
                  </h4>
                  <div className="grid gap-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer:</span>
                      <span className="font-medium">{pendingStatusChange.request.customer_name}</span>
                    </div>
                    {pendingStatusChange.request.company_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Company:</span>
                        <span className="font-medium">{pendingStatusChange.request.company_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Changing to:</span>
                      <Badge variant="secondary">{pendingStatusChange.newStatus.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Option Toggle: Link Existing Invoice OR Create New */}
              <div className="flex gap-2">
                <Button 
                  variant={!linkExistingInvoice ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => {
                    setLinkExistingInvoice(false);
                    setSelectedExistingInvoice('');
                  }}
                >
                  Create New Invoice
                </Button>
                <Button 
                  variant={linkExistingInvoice ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => {
                    setLinkExistingInvoice(true);
                    setSelectedCustomerForRequest('');
                    setCreateCustomerForRequest(false);
                  }}
                >
                  Link Existing Invoice
                </Button>
              </div>

              {linkExistingInvoice ? (
                // Link Existing Invoice Section
                <div className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Select Existing Invoice
                    </h4>
                    <Select value={selectedExistingInvoice} onValueChange={setSelectedExistingInvoice}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose an invoice to link..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] z-[9999] bg-popover">
                        {invoices
                          .filter(inv => !inv.is_draft && inv.invoice_number !== 'PENDING')
                          .map((invoice) => (
                            <SelectItem key={invoice.id} value={invoice.id}>
                              {invoice.invoice_number} - {invoice.customer?.name} (${invoice.total_amount.toFixed(2)})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="rounded-xl border bg-green-500/5 border-green-500/20 p-4">
                      <p className="text-sm text-muted-foreground">
                        Linking an existing invoice will use that invoice's customer. No new customer will be created.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Create New Invoice Section
                <>
                  {/* Customer Selection */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Step 1: Select or Create Customer
                      </h4>
                    </div>
                    
                    {!createCustomerForRequest ? (
                      <div className="space-y-3">
                        <div className="grid gap-2">
                          <Label>Select Existing Customer</Label>
                          <Select value={selectedCustomerForRequest} onValueChange={setSelectedCustomerForRequest}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a customer..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px] z-[9999] bg-popover">
                              {customers.map((customer) => (
                                <SelectItem key={customer.id} value={customer.id}>
                                  {customer.name} {customer.company_name ? `(${customer.company_name})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="text-center text-sm text-muted-foreground">— or —</div>
                        
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setCreateCustomerForRequest(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Customer
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border bg-card/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-semibold">New Customer Details</Label>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setCreateCustomerForRequest(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                        <div className="grid gap-3">
                          <div className="grid gap-1">
                            <Label htmlFor="new-cust-name" className="text-xs">Name *</Label>
                            <Input
                              id="new-cust-name"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              placeholder="Customer name"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1">
                              <Label htmlFor="new-cust-email" className="text-xs">Email</Label>
                              <Input
                                id="new-cust-email"
                                type="email"
                                value={newCustomerEmail}
                                onChange={(e) => setNewCustomerEmail(e.target.value)}
                                placeholder="email@example.com"
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor="new-cust-phone" className="text-xs">Phone</Label>
                              <Input
                                id="new-cust-phone"
                                value={newCustomerPhone}
                                onChange={(e) => setNewCustomerPhone(e.target.value)}
                                placeholder="+1234567890"
                              />
                            </div>
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor="new-cust-company" className="text-xs">Company Name</Label>
                            <Input
                              id="new-cust-company"
                              value={newCustomerCompany}
                              onChange={(e) => setNewCustomerCompany(e.target.value)}
                              placeholder="Company name"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Invoice Creation Info */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Step 2: Create Invoice
                    </h4>
                    <div className="rounded-xl border bg-blue-500/5 border-blue-500/20 p-4">
                      <p className="text-sm text-muted-foreground">
                        After selecting a customer, you'll be taken to the invoice creation form to enter invoice details, items, and pricing.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
          
          <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => {
              setInvoiceRequiredDialogOpen(false);
              setPendingStatusChange(null);
              setLinkExistingInvoice(false);
              setSelectedExistingInvoice('');
            }}>
              Cancel
            </Button>
            {linkExistingInvoice ? (
              <Button 
                onClick={handleLinkExistingInvoiceToRequest}
                disabled={!selectedExistingInvoice}
              >
                <FileText className="h-4 w-4 mr-2" />
                Link Invoice & Update Status
              </Button>
            ) : (
              <Button 
                onClick={handleCreateCustomerAndInvoiceForRequest}
                disabled={!createCustomerForRequest && !selectedCustomerForRequest}
              >
                <FileText className="h-4 w-4 mr-2" />
                Proceed to Invoice Form
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default AccountantDashboard;