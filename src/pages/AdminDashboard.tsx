import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Package, Users, DollarSign, AlertCircle, Calendar as CalendarIcon, Download, Activity, Plus, FileText, Pencil, Trash2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { generateDailyActivityPDF } from '@/utils/generateDailyActivityPDF';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { z } from 'zod';
import { InvoiceDialog } from '@/components/InvoiceDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Order {
  id: string;
  job_title: string;
  status: string;
  order_value: number;
  payment_status: string;
  created_at: string;
  delivery_date: string | null;
  customer_id: string;
  designer_id: string | null;
  salesperson_id: string | null;
  customers: { name: string } | null;
  designer?: { full_name: string } | null;
  salesperson?: { full_name: string } | null;
}

interface Designer {
  id: string;
  full_name: string;
}

interface Salesperson {
  id: string;
  full_name: string;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer: { name: string };
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
  order_id?: string | null;
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

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(9, 'Phone must be at least 9 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('').transform(() => null)),
  company_name: z.string().optional().or(z.literal('').transform(() => null)),
});

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // Filter states
  const [filterDesigner, setFilterDesigner] = useState<string>('all');
  const [filterSalesperson, setFilterSalesperson] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<Date>(new Date());

  // Customer form states
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);

  // Invoice form states
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceOrder, setInvoiceOrder] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceTax, setInvoiceTax] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceProjectName, setInvoiceProjectName] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [editInvoiceDialogOpen, setEditInvoiceDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  
  // Invoice items state
  interface InvoiceItem {
    id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;

    // Preserve advanced invoice item fields created elsewhere (do not wipe on edit)
    product_id?: string | null;
    sale_type?: string;
    width_m?: number | null;
    height_m?: number | null;
    area_m2?: number | null;
    rate_per_m2?: number | null;
    retail_unit?: string | null;
    cost_per_unit?: number | null;
    line_cost?: number | null;
    line_profit?: number | null;
  }
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit' }
  ]);
  
  // Payment states
  const [payments, setPayments] = useState<any[]>([]);
  const [editPaymentDialogOpen, setEditPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [paymentAllocation, setPaymentAllocation] = useState<{invoiceId: string, amount: number, selected: boolean}[]>([]);

  // Stats
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
    deliveredOrders: 0
  });

  // Debounce ref to prevent excessive refetches
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  const debouncedFetchAllData = useCallback(() => {
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }
    refetchTimeoutRef.current = setTimeout(() => {
      if (!isFetchingRef.current) {
        fetchAllData();
      }
    }, 1000); // Debounce for 1 second
  }, []);

  useEffect(() => {
    fetchAllData();

    // Set up single realtime channel for all tables
    const channel = supabase
      .channel('admin-all-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, debouncedFetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, debouncedFetchAllData)
      .subscribe();

    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [debouncedFetchAllData]);

  useEffect(() => {
    applyFilters();
  }, [orders, filterDesigner, filterSalesperson, filterCustomer, filterStatus, searchQuery, dateFilter]);

  const fetchAllData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    try {
      setLoading(true);

      // Fetch orders filtered by date
      const startDate = startOfDay(dateFilter).toISOString();
      const endDate = endOfDay(dateFilter).toISOString();

      // Fetch order history for today's activity
      const { data: historyData } = await supabase
        .from('order_history')
        .select('*, orders(job_title, status, customers(name))')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      
      setOrderHistory(historyData || []);
      
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, customers(name)')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Batch fetch all unique designer and salesperson profiles in a single query
      const allProfileIds = [
        ...new Set([
          ...(ordersData || []).map(o => o.designer_id).filter(Boolean),
          ...(ordersData || []).map(o => o.salesperson_id).filter(Boolean)
        ])
      ];

      let profilesMap = new Map();
      if (allProfileIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allProfileIds);
        
        profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      }

      const ordersWithProfiles = (ordersData || []).map(order => ({
        ...order,
        designer: order.designer_id ? profilesMap.get(order.designer_id) || null : null,
        salesperson: order.salesperson_id ? profilesMap.get(order.salesperson_id) || null : null,
      }));

      setOrders(ordersWithProfiles);

      // Calculate stats from orders
      const orderRevenue = ordersWithProfiles.reduce((sum, o) => sum + (o.order_value || 0), 0);
      const pendingOrders = ordersWithProfiles.filter(o => o.status === 'pending').length;
      const deliveredOrders = ordersWithProfiles.filter(o => o.status === 'delivered').length;

      // Get all invoices to include standalone invoice revenue
      const { data: allInvoices } = await supabase
        .from('invoices')
        .select('total_amount, order_id');

      // Add revenue from standalone invoices (not linked to orders)
      const standaloneInvoiceRevenue = allInvoices
        ?.filter(inv => !inv.order_id)
        .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;

      const totalRevenue = orderRevenue + standaloneInvoiceRevenue;

      setStats({
        totalOrders: ordersWithProfiles.length,
        totalRevenue,
        pendingOrders,
        deliveredOrders
      });

      // Fetch designers
      const { data: designersData } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name)')
        .eq('role', 'designer');

      const designersList = designersData
        ?.map((d: any) => d.profiles)
        .filter((p: any) => p !== null) || [];
      setDesigners(designersList);

      // Fetch salespeople
      const { data: salespeopleData } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name)')
        .eq('role', 'sales');

      const salespeopleList = salespeopleData
        ?.map((s: any) => s.profiles)
        .filter((p: any) => p !== null) || [];
      setSalespeople(salespeopleList);

      // Fetch customers
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, name, email, phone, company_name, created_at')
        .order('name');

      setCustomers(customersData || []);

      // Fetch ALL invoices (accessible to both admin and accountant via RLS)
      const { data: invoicesData } = await supabase
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
          )
        `)
        .order('created_at', { ascending: false });
      
      setInvoices(invoicesData || []);

      // Fetch ALL payments (accessible to both admin and accountant via RLS)
      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          *,
          order:orders(job_title, customer:customers(name)),
          invoice:invoices(invoice_number, customer:customers(name))
        `)
        .order('payment_date', { ascending: false });
      
      setPayments(paymentsData || []);

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const applyFilters = () => {
    let filtered = [...orders];

    if (filterDesigner !== 'all') {
      filtered = filtered.filter(o => o.designer_id === filterDesigner);
    }

    if (filterSalesperson !== 'all') {
      filtered = filtered.filter(o => o.salesperson_id === filterSalesperson);
    }

    if (filterCustomer !== 'all') {
      filtered = filtered.filter(o => o.customer_id === filterCustomer);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(o => o.status === filterStatus);
    }

    if (searchQuery) {
      filtered = filtered.filter(o =>
        o.job_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customers?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500',
      designing: 'bg-blue-500',
      designed: 'bg-purple-500',
      approved: 'bg-green-500',
      printing: 'bg-orange-500',
      printed: 'bg-teal-500',
      delivered: 'bg-green-700',
      on_hold: 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      unpaid: 'bg-red-500',
      partial: 'bg-yellow-500',
      paid: 'bg-green-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const handleCreateCustomer = async () => {
    try {
      const validatedData = customerSchema.parse({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || null,
        company_name: customerCompany || null,
      });

      const { error } = await supabase
        .from('customers')
        .insert([{ 
          name: validatedData.name,
          phone: validatedData.phone,
          email: validatedData.email,
          company_name: validatedData.company_name,
          created_by: user?.id 
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer created successfully',
      });

      setIsCustomerDialogOpen(false);
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create customer',
        variant: 'destructive',
      });
    }
  };

  const addInvoiceItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      { description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit' }
    ]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    }
  };

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number | null) => {
    const newItems = [...invoiceItems];
    newItems[index] = { ...newItems[index], [field]: value } as InvoiceItem;

    // Auto-calculate amount ONLY for unit-based items when qty or unit price changes.
    const item = newItems[index];
    if ((field === 'quantity' || field === 'unit_price') && (item.sale_type ?? 'unit') === 'unit') {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      newItems[index].amount = qty * unitPrice;
    }

    setInvoiceItems(newItems);
  };

  const calculateInvoiceSubtotal = () => {
    return invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleCreateInvoice = async () => {
    if (!invoiceNumber || !invoiceCustomer || invoiceItems.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields and add at least one item',
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

    try {
      const subtotal = calculateInvoiceSubtotal();
      const tax = parseFloat(invoiceTax) || 0;
      const total = subtotal + tax;

      // Insert invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert([
          {
            invoice_number: invoiceNumber,
            customer_id: invoiceCustomer,
            order_id: invoiceOrder || null,
            invoice_date: new Date().toISOString().split('T')[0],
            due_date: invoiceDueDate || null,
            subtotal,
            tax_amount: tax,
            total_amount: total,
            amount_paid: 0,
            status: 'draft',
            notes: invoiceNotes || null,
            project_name: invoiceProjectName || null,
            created_by: user?.id,
          },
        ])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert invoice items
      const itemsToInsert = invoiceItems.map(item => ({
        invoice_id: invoiceData.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({
        title: 'Success',
        description: `Invoice ${invoiceNumber} created successfully`,
      });

      // Reset form
      setInvoiceNumber('');
      setInvoiceCustomer('');
      setInvoiceOrder('');
      setInvoiceDueDate('');
      setInvoiceTax('');
      setInvoiceNotes('');
      setInvoiceProjectName('');
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit' }]);
      
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) return;

      let updateData: any = { status: newStatus };

      if (newStatus === 'paid') {
        updateData.amount_paid = invoice.total_amount;
        
        // Create a payment record when marking invoice as paid
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase
          .from('payments')
          .insert([{
            invoice_id: invoiceId,
            order_id: invoice.order_id,
            amount: invoice.total_amount,
            payment_method: 'cash',
            reference_number: `Auto-${invoice.invoice_number}`,
            notes: 'Payment auto-recorded when invoice marked as paid',
            recorded_by: user?.id,
          }]);
      } else if (newStatus === 'unpaid') {
        updateData.amount_paid = 0;
        
        // Delete auto-generated payment records for this invoice
        await supabase
          .from('payments')
          .delete()
          .eq('invoice_id', invoiceId)
          .like('notes', '%auto-recorded%');
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Invoice marked as ${newStatus}`,
      });

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    try {
      // First delete invoice items
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

      if (itemsError) throw itemsError;

      // Then delete the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

      if (invoiceError) throw invoiceError;

      toast({
        title: 'Success',
        description: 'Invoice deleted successfully',
      });

      fetchAllData();
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
    setInvoiceTax(`${invoice.tax_amount ?? 0}`);
    setInvoiceNotes(invoice.notes || '');
    setInvoiceProjectName(invoice.project_name || '');

    // Load invoice items (keep IDs + advanced fields so edits don't wipe existing data)
    if (invoice.invoice_items && invoice.invoice_items.length > 0) {
      setInvoiceItems(
        invoice.invoice_items.map((item: any) => ({
          id: item.id,
          description: item.description ?? '',
          quantity: Number(item.quantity ?? 1),
          unit_price: Number(item.unit_price ?? 0),
          amount: Number(item.amount ?? 0),

          product_id: item.product_id ?? null,
          sale_type: item.sale_type ?? 'unit',
          width_m: item.width_m ?? null,
          height_m: item.height_m ?? null,
          area_m2: item.area_m2 ?? null,
          rate_per_m2: item.rate_per_m2 ?? null,
          retail_unit: item.retail_unit ?? null,
          cost_per_unit: item.cost_per_unit ?? null,
          line_cost: item.line_cost ?? null,
          line_profit: item.line_profit ?? null,
        }))
      );
    } else {
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit' }]);
    }

    setEditInvoiceDialogOpen(true);
  };

  const handleUpdateInvoice = async () => {
    if (!editingInvoice) return;

    if (!invoiceNumber || !invoiceCustomer || invoiceItems.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields and add at least one item',
        variant: 'destructive',
      });
      return;
    }

    const hasEmptyDescriptions = invoiceItems.some(item => !String(item.description || '').trim());
    if (hasEmptyDescriptions) {
      toast({
        title: 'Validation Error',
        description: 'All items must have a description',
        variant: 'destructive',
      });
      return;
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

      // Update items WITHOUT wiping extra columns (product_id, area fields, retail_unit, cost/profit, etc.)
      const previousIds = new Set<string>((editingInvoice.invoice_items || []).map((it: any) => it.id).filter(Boolean));
      const currentIds = new Set<string>(invoiceItems.map(it => it.id).filter(Boolean) as string[]);

      const removedIds = Array.from(previousIds).filter(id => !currentIds.has(id));
      if (removedIds.length > 0) {
        const { error: removeErr } = await supabase
          .from('invoice_items')
          .delete()
          .in('id', removedIds);
        if (removeErr) throw removeErr;
      }

      const existingItems = invoiceItems.filter(it => !!it.id);
      for (const it of existingItems) {
        const { error: updErr } = await supabase
          .from('invoice_items')
          .update({
            description: it.description,
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            amount: Number(it.amount) || 0,
          })
          .eq('id', it.id as string);
        if (updErr) throw updErr;
      }

      const newItems = invoiceItems.filter(it => !it.id);
      if (newItems.length > 0) {
        const { error: insErr } = await supabase
          .from('invoice_items')
          .insert(
            newItems.map(it => ({
              invoice_id: editingInvoice.id,
              description: it.description,
              quantity: Number(it.quantity) || 0,
              unit_price: Number(it.unit_price) || 0,
              amount: Number(it.amount) || 0,
              // keep defaults but allow preserving if present
              product_id: it.product_id ?? null,
              sale_type: it.sale_type ?? 'unit',
              width_m: it.width_m ?? null,
              height_m: it.height_m ?? null,
              area_m2: it.area_m2 ?? null,
              rate_per_m2: it.rate_per_m2 ?? null,
              retail_unit: it.retail_unit ?? null,
              cost_per_unit: it.cost_per_unit ?? null,
              line_cost: it.line_cost ?? null,
              line_profit: it.line_profit ?? null,
            }))
          );
        if (insErr) throw insErr;
      }

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
      setInvoiceItems([{ description: '', quantity: 1, unit_price: 0, amount: 0, sale_type: 'unit' }]);

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEditPayment = (payment: any) => {
    setEditingPayment(payment);
    setEditPaymentDialogOpen(true);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment) return;

    try {
      const { error } = await supabase
        .from('payments')
        .update({
          amount: editingPayment.amount,
          payment_method: editingPayment.payment_method,
          reference_number: editingPayment.reference_number,
          notes: editingPayment.notes,
          payment_date: editingPayment.payment_date,
        })
        .eq('id', editingPayment.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment updated successfully',
      });

      setEditPaymentDialogOpen(false);
      setEditingPayment(null);
      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleOpenAddPayment = async (customerId?: string) => {
    const selectedCustomerId = customerId || paymentCustomerId;
    if (!selectedCustomerId) {
      toast({
        title: 'Error',
        description: 'Please select a customer first',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Fetch all outstanding invoices for this customer (not fully paid)
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
        selected: false
      })));
      
      if (!outstandingInvoices || outstandingInvoices.length === 0) {
        toast({
          title: 'No Outstanding Invoices',
          description: 'This customer has no unpaid invoices.',
          variant: 'default',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }

    if (customerId) setPaymentCustomerId(customerId);
    setAddPaymentDialogOpen(true);
  };

  const handleToggleInvoiceSelection = (invoiceId: string) => {
    setPaymentAllocation(prev => prev.map(alloc => 
      alloc.invoiceId === invoiceId 
        ? { ...alloc, selected: !alloc.selected, amount: !alloc.selected ? (customerInvoices.find(inv => inv.id === invoiceId)?.total_amount - customerInvoices.find(inv => inv.id === invoiceId)?.amount_paid || 0) : 0 }
        : alloc
    ));
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

  const handleAddPayment = async () => {
    const selectedAllocations = paymentAllocation.filter(alloc => alloc.selected && alloc.amount > 0);
    
    if (!paymentCustomerId || selectedAllocations.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one invoice and enter payment amount(s)',
        variant: 'destructive',
      });
      return;
    }

    try {
      const totalAmount = selectedAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);

      // Insert main payment record
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          amount: totalAmount,
          payment_method: paymentMethod as any,
          reference_number: paymentReference || null,
          notes: paymentNotes || null,
          recorded_by: user?.id,
          payment_date: new Date().toISOString(),
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Update invoices with allocated amounts
      for (const alloc of selectedAllocations) {
        const invoice = customerInvoices.find(inv => inv.id === alloc.invoiceId);
        if (!invoice) continue;

        const newAmountPaid = invoice.amount_paid + alloc.amount;
        const newStatus = newAmountPaid >= invoice.total_amount ? 'paid' : 
                         newAmountPaid > 0 ? 'partial' : 'unpaid';

        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({
            amount_paid: newAmountPaid,
            status: newStatus
          })
          .eq('id', alloc.invoiceId);

        if (invoiceError) throw invoiceError;

        // Create payment record linked to this invoice
        await supabase
          .from('payments')
          .insert([{
            invoice_id: alloc.invoiceId,
            amount: alloc.amount,
            payment_method: paymentMethod as any,
            reference_number: paymentReference || null,
            notes: `Allocated from payment ${paymentData.id}`,
            recorded_by: user?.id,
            payment_date: new Date().toISOString(),
          }]);
      }

      toast({
        title: 'Success',
        description: `Payment of $${totalAmount.toLocaleString()} added and allocated across ${selectedAllocations.length} invoice(s)`,
      });

      // Reset form
      setAddPaymentDialogOpen(false);
      setPaymentCustomerId('');
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

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment record deleted successfully',
      });

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOrder = async (orderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent navigation when clicking delete
    
    if (!confirm('Are you sure you want to delete this order and all related data (invoices, payments, files, comments)? This action cannot be undone.')) {
      return;
    }

    try {
      // First, get the invoice linked to this order to delete its items
      const { data: linkedInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();

      // Delete invoice items if invoice exists
      if (linkedInvoice) {
        await supabase.from('invoice_items').delete().eq('invoice_id', linkedInvoice.id);
        
        // Delete payments linked to the invoice
        await supabase.from('payments').delete().eq('invoice_id', linkedInvoice.id);
        
        // Delete the invoice
        await supabase.from('invoices').delete().eq('id', linkedInvoice.id);
      }

      // Delete related records in order
      await supabase.from('payments').delete().eq('order_id', orderId);
      await supabase.from('commissions').delete().eq('order_id', orderId);
      await supabase.from('order_files').delete().eq('order_id', orderId);
      await supabase.from('order_comments').delete().eq('order_id', orderId);
      await supabase.from('order_history').delete().eq('order_id', orderId);
      await supabase.from('notifications').delete().eq('order_id', orderId);

      // Finally delete the order
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order and all related data deleted successfully',
      });

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer deleted successfully',
      });

      fetchAllData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDownloadActivityReport = async () => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();

      const activities = orderHistory.map(h => ({
        time: format(new Date(h.created_at), 'HH:mm'),
        action: h.action,
        details: `${h.orders?.job_title || 'N/A'} - ${h.orders?.customers?.name || 'N/A'}`,
        status: h.details?.new_status || h.details?.old_status || 'N/A'
      }));

      generateDailyActivityPDF({
        userRole: 'Admin',
        userName: profileData?.full_name || 'Admin',
        date: dateFilter,
        activities,
        stats: [
          { label: 'Total Orders', value: stats.totalOrders },
          { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}` },
          { label: 'Pending Orders', value: stats.pendingOrders },
          { label: 'Delivered Orders', value: stats.deliveredOrders },
        ]
      });

      toast({
        title: 'Success',
        description: 'Activity report downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4 sm:space-y-6 w-full max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Complete oversight and control of all jobs</p>
        </div>
        <Button onClick={handleDownloadActivityReport} className="gap-2">
          <Download className="h-4 w-4" />
          Download Today's Report
        </Button>
      </div>

      {/* Today's Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Today's Activity ({orderHistory.length} actions)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {orderHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No activity recorded today</p>
            ) : (
              orderHistory
                .filter((history) => history.action === 'Order Created')
                .slice(0, 10)
                .map((history) => {
                  const orderStatus = history.orders?.status || 'pending';
                  const statusText = orderStatus === 'completed' 
                    ? 'Completed' 
                    : orderStatus === 'printing' 
                    ? 'In Print' 
                    : orderStatus === 'designing'
                    ? 'In Design'
                    : orderStatus === 'ready_for_print'
                    ? 'Ready for Print'
                    : 'Pending';
                  
                  return (
                    <div key={history.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="text-xs text-muted-foreground min-w-[50px]">
                        {format(new Date(history.created_at), 'HH:mm')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {history.orders?.job_title || 'N/A'} - {history.orders?.customers?.name || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Status: {statusText}
                        </p>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.deliveredOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  <span className="truncate">{dateFilter ? format(dateFilter, "PPP") : "Pick a date"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFilter}
                  onSelect={(date) => {
                    if (date) {
                      setDateFilter(date);
                      fetchAllData();
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />

            <Select value={filterDesigner} onValueChange={setFilterDesigner}>
              <SelectTrigger>
                <SelectValue placeholder="All Designers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Designers</SelectItem>
                {designers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterSalesperson} onValueChange={setFilterSalesperson}>
              <SelectTrigger>
                <SelectValue placeholder="All Salespeople" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Salespeople</SelectItem>
                {salespeople.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="designing">In Design</SelectItem>
                <SelectItem value="designed">Ready for Print</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="printing">Printing</SelectItem>
                <SelectItem value="printed">Printed</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>All Orders ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No orders found</p>
            ) : (
              filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-semibold truncate">{order.job_title}</h3>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                      <Badge className={getPaymentStatusColor(order.payment_status)}>
                        {order.payment_status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="truncate">Customer: {order.customers?.name || 'N/A'}</p>
                      <p className="truncate">Designer: {order.designer?.full_name || 'Unassigned'}</p>
                      <p className="truncate">Salesperson: {order.salesperson?.full_name || 'N/A'}</p>
                      <p>Created: {format(new Date(order.created_at), 'MMM dd, yyyy')}</p>
                      {order.delivery_date && (
                        <p>Delivery: {format(new Date(order.delivery_date), 'MMM dd, yyyy')}</p>
                      )}
                    </div>
                  </div>
                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end gap-2">
                    <p className="text-xl sm:text-2xl font-bold">${order.order_value?.toLocaleString() || '0'}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="whitespace-nowrap">
                        View Details
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={(e) => handleDeleteOrder(order.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="customers" className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Customer Management</h2>
          <p className="text-muted-foreground">Create and manage customers</p>
        </div>
        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Customer</DialogTitle>
              <DialogDescription>Add a new customer to the system</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  placeholder="Company name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateCustomer}>Create Customer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{customer.company_name || '-'}</TableCell>
                  <TableCell>{format(new Date(customer.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCustomer(customer.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="invoices" className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Invoice Management</h2>
          <p className="text-muted-foreground">Create and manage invoices</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
              <DialogDescription>Create a new invoice for a customer</DialogDescription>
            </DialogHeader>
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
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoice-order">Related Order (Optional)</Label>
                <Select value={invoiceOrder} onValueChange={setInvoiceOrder}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select order (optional)" />
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
              <div className="grid gap-2">
                <Label htmlFor="due-date">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                />
              </div>
              {/* Invoice Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Invoice Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                
                {invoiceItems.map((item, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label>Description *</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="grid gap-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Unit Price *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
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
                      </div>
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

                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="font-semibold">Subtotal:</span>
                  <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tax">Tax Amount</Label>
                <Input
                  id="tax"
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
                <Label htmlFor="invoice-notes">Notes</Label>
                <Input
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

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <>
                  <TableRow 
                    key={invoice.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedInvoiceId(expandedInvoiceId === invoice.id ? null : invoice.id)}
                  >
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.customer?.name || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}</TableCell>
                    <TableCell>${invoice.total_amount.toLocaleString()}</TableCell>
                    <TableCell>${invoice.amount_paid.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'default' : invoice.status === 'unpaid' ? 'destructive' : 'secondary'}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setInvoiceDialogOpen(true);
                          }}
                          title="View Invoice"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditInvoice(invoice)}
                          title="Edit Invoice"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          title="Delete Invoice"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {invoice.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleUpdateInvoiceStatus(invoice.id, 'paid')}
                          >
                            Mark Paid
                          </Button>
                        )}
                        {invoice.status === 'paid' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleUpdateInvoiceStatus(invoice.id, 'unpaid')}
                          >
                            Mark Unpaid
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="payments" className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Payment Management</h2>
          <p className="text-muted-foreground">View and manage payment records</p>
        </div>
        <Button onClick={() => setAddPaymentDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Payment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No payment records found
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {payment.order?.job_title || payment.invoice?.invoice_number || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {payment.order?.customer?.name || payment.invoice?.customer?.name || 'N/A'}
                    </TableCell>
                    <TableCell>${payment.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.payment_method.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{payment.reference_number || '-'}</TableCell>
                    <TableCell>
                      {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPayment(payment)}
                          title="Edit Payment"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeletePayment(payment.id)}
                          title="Delete Payment"
                        >
                          <Trash2 className="h-4 w-4" />
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

    </Tabs>

    {selectedInvoice && (
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        order={selectedInvoice}
      />
    )}

    {/* Edit Invoice Dialog */}
    <Dialog open={editInvoiceDialogOpen} onOpenChange={setEditInvoiceDialogOpen}>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Invoice</DialogTitle>
          <DialogDescription>Update invoice details</DialogDescription>
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
            <Label htmlFor="edit-invoice-order">Related Order (Optional)</Label>
            <Select value={invoiceOrder} onValueChange={setInvoiceOrder}>
              <SelectTrigger>
                <SelectValue placeholder="Select order (optional)" />
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
          <div className="grid gap-2">
            <Label htmlFor="edit-due-date">Due Date</Label>
            <Input
              id="edit-due-date"
              type="date"
              value={invoiceDueDate}
              onChange={(e) => setInvoiceDueDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-project-name">Project Name</Label>
            <Input
              id="edit-project-name"
              value={invoiceProjectName}
              onChange={(e) => setInvoiceProjectName(e.target.value)}
              placeholder="Project / job name"
            />
          </div>
          {/* Invoice Items */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Invoice Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            
            {invoiceItems.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>Description *</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Unit Price *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateInvoiceItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={Number.isFinite(item.amount) ? item.amount : 0}
                        onChange={(e) => updateInvoiceItem(index, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
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

            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="font-semibold">Subtotal:</span>
              <span className="text-xl font-bold">${calculateInvoiceSubtotal().toFixed(2)}</span>
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

    {/* Edit Payment Dialog */}
    <Dialog open={editPaymentDialogOpen} onOpenChange={setEditPaymentDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
          <DialogDescription>
            Update payment details
          </DialogDescription>
        </DialogHeader>
        
        {editingPayment && (
          <div className="space-y-4">
            <div className="grid gap-4">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingPayment.amount}
                  onChange={(e) => setEditingPayment({ ...editingPayment, amount: e.target.value })}
                />
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select
                  value={editingPayment.payment_method}
                  onValueChange={(value) => setEditingPayment({ ...editingPayment, payment_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
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

              <div>
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={editingPayment.payment_date ? format(new Date(editingPayment.payment_date), 'yyyy-MM-dd') : ''}
                  onChange={(e) => setEditingPayment({ ...editingPayment, payment_date: e.target.value })}
                />
              </div>

              <div>
                <Label>Reference Number</Label>
                <Input
                  value={editingPayment.reference_number || ''}
                  onChange={(e) => setEditingPayment({ ...editingPayment, reference_number: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  value={editingPayment.notes || ''}
                  onChange={(e) => setEditingPayment({ ...editingPayment, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setEditPaymentDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdatePayment}>
            Update Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Payment Dialog */}
    <Dialog open={addPaymentDialogOpen} onOpenChange={setAddPaymentDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Customer Payment</DialogTitle>
          <DialogDescription>
            Record a payment and allocate it across outstanding invoices
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="payment-customer">Customer *</Label>
              <Select value={paymentCustomerId} onValueChange={(value) => {
                setPaymentCustomerId(value);
                handleOpenAddPayment(value);
              }}>
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

            {customerInvoices.length > 0 && (
              <>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold">Outstanding Invoices</h4>
                  {customerInvoices.map((invoice) => {
                    const outstanding = invoice.total_amount - invoice.amount_paid;
                    return (
                      <div key={invoice.id} className="flex justify-between text-sm">
                        <span>{invoice.invoice_number}</span>
                        <span className="font-medium">${outstanding.toLocaleString()} outstanding</span>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between font-bold">
                      <span>Total Outstanding:</span>
                      <span>${customerInvoices.reduce((sum, inv) => sum + (inv.total_amount - inv.amount_paid), 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>


                <div>
                  <Label htmlFor="payment-method">Payment Method *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
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

                <div>
                  <Label htmlFor="payment-reference">Reference Number</Label>
                  <Input
                    id="payment-reference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <Label htmlFor="payment-notes">Notes</Label>
                  <Input
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </>
            )}

            {customerInvoices.length === 0 && paymentCustomerId && (
              <div className="text-center p-4 text-muted-foreground">
                No outstanding invoices for this customer
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setAddPaymentDialogOpen(false);
            setPaymentCustomerId('');
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
            onClick={handleAddPayment}
            disabled={!paymentCustomerId || paymentAllocation.filter(a => a.selected && a.amount > 0).length === 0}
          >
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </Layout>
  );
}
