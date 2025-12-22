import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  FileText,
  Eye,
  Download,
  Filter,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Search,
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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { generateQuotationPDF } from '@/utils/generateQuotationPDF';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface QuotationItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  customer: Customer;
  quotation_date: string;
  valid_until: string | null;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'approved' | 'converted' | 'rejected' | 'expired' | 'cancelled';
  notes: string | null;
  terms: string | null;
  converted_invoice_id: string | null;
  quotation_items: QuotationItem[];
}

const Quotations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  // Form states
  const [formCustomer, setFormCustomer] = useState('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formDiscountType, setFormDiscountType] = useState('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState('0');
  const [formTaxRate, setFormTaxRate] = useState('0');
  const [formNotes, setFormNotes] = useState('');
  const [formTerms, setFormTerms] = useState('');
  const [formItems, setFormItems] = useState<QuotationItem[]>([
    { description: '', quantity: 1, unit_price: 0, amount: 0 }
  ]);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    approved: 0,
    converted: 0,
    rejected: 0,
    expired: 0,
    cancelled: 0,
    conversionRate: 0,
  });

  const fetchQuotations = useCallback(async () => {
    try {
      setLoading(true);
      const startDateFilter = startDate.toISOString();
      const endDateFilter = endDate.toISOString();

      const { data, error } = await supabase
        .from('quotations')
        .select(`
          *,
          customer:customers(id, name, email, phone),
          quotation_items(id, description, quantity, unit_price, amount)
        `)
        .gte('quotation_date', startDateFilter.split('T')[0])
        .lte('quotation_date', endDateFilter.split('T')[0])
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedData = (data || []).map(q => ({
        ...q,
        status: q.status as 'draft' | 'sent' | 'approved' | 'converted' | 'rejected' | 'expired' | 'cancelled'
      }));
      
      setQuotations(typedData);

      // Calculate stats
      const total = typedData.length;
      const draft = typedData.filter(q => q.status === 'draft').length;
      const sent = typedData.filter(q => q.status === 'sent').length;
      const approved = typedData.filter(q => q.status === 'approved').length;
      const converted = typedData.filter(q => q.status === 'converted').length;
      const rejected = typedData.filter(q => q.status === 'rejected').length;
      const expired = typedData.filter(q => q.status === 'expired').length;
      const cancelled = typedData.filter(q => q.status === 'cancelled').length;
      const conversionRate = total > 0 ? ((converted / total) * 100) : 0;

      setStats({ total, draft, sent, approved, converted, rejected, expired, cancelled, conversionRate });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, toast]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, name, email, phone')
      .order('name');
    setCustomers(data || []);
  };

  useEffect(() => {
    fetchQuotations();
    fetchCustomers();

    // Set up realtime subscription
    const channel = supabase
      .channel('quotations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotations' },
        () => fetchQuotations()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotation_items' },
        () => fetchQuotations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQuotations]);

  const resetForm = () => {
    setFormCustomer('');
    setFormValidUntil('');
    setFormDiscountType('percentage');
    setFormDiscountValue('0');
    setFormTaxRate('0');
    setFormNotes('');
    setFormTerms('');
    setFormItems([{ description: '', quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const calculateTotals = () => {
    const subtotal = formItems.reduce((sum, item) => sum + item.amount, 0);
    const discountValue = parseFloat(formDiscountValue) || 0;
    let discountAmount = 0;
    
    if (formDiscountType === 'percentage') {
      discountAmount = (subtotal * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }
    
    const afterDiscount = subtotal - discountAmount;
    const taxRate = parseFloat(formTaxRate) || 0;
    const taxAmount = (afterDiscount * taxRate) / 100;
    const totalAmount = afterDiscount + taxAmount;

    return { subtotal, discountAmount, taxAmount, totalAmount };
  };

  const handleItemChange = (index: number, field: keyof QuotationItem, value: string | number) => {
    const newItems = [...formItems];
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index][field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
      newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    } else if (field === 'description') {
      newItems[index].description = value as string;
    }
    setFormItems(newItems);
  };

  const addItem = () => {
    setFormItems([...formItems, { description: '', quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((_, i) => i !== index));
    }
  };

  const handleCreate = async () => {
    try {
      if (!formCustomer) {
        toast({ title: 'Error', description: 'Please select a customer', variant: 'destructive' });
        return;
      }

      if (formItems.some(item => !item.description)) {
        toast({ title: 'Error', description: 'Please fill in all item descriptions', variant: 'destructive' });
        return;
      }

      // Generate quotation number
      const { data: numData } = await supabase.rpc('generate_quotation_number');
      const quotationNumber = numData || `QUO-${Date.now()}`;

      const { subtotal, discountAmount, taxAmount, totalAmount } = calculateTotals();

      const { data: quotation, error: quotationError } = await supabase
        .from('quotations')
        .insert({
          quotation_number: quotationNumber,
          customer_id: formCustomer,
          valid_until: formValidUntil || null,
          subtotal,
          discount_type: formDiscountType,
          discount_value: parseFloat(formDiscountValue) || 0,
          discount_amount: discountAmount,
          tax_rate: parseFloat(formTaxRate) || 0,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: formNotes || null,
          terms: formTerms || null,
          status: 'draft',
        })
        .select()
        .single();

      if (quotationError) throw quotationError;

      // Insert items
      const itemsToInsert = formItems.map(item => ({
        quotation_id: quotation.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({ title: 'Success', description: 'Quotation created successfully' });
      setCreateDialogOpen(false);
      resetForm();
      fetchQuotations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = async () => {
    if (!selectedQuotation) return;

    try {
      const { subtotal, discountAmount, taxAmount, totalAmount } = calculateTotals();

      const { error: quotationError } = await supabase
        .from('quotations')
        .update({
          customer_id: formCustomer,
          valid_until: formValidUntil || null,
          subtotal,
          discount_type: formDiscountType,
          discount_value: parseFloat(formDiscountValue) || 0,
          discount_amount: discountAmount,
          tax_rate: parseFloat(formTaxRate) || 0,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          notes: formNotes || null,
          terms: formTerms || null,
        })
        .eq('id', selectedQuotation.id);

      if (quotationError) throw quotationError;

      // Delete existing items and insert new ones
      await supabase
        .from('quotation_items')
        .delete()
        .eq('quotation_id', selectedQuotation.id);

      const itemsToInsert = formItems.map(item => ({
        quotation_id: selectedQuotation.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({ title: 'Success', description: 'Quotation updated successfully' });
      setEditDialogOpen(false);
      resetForm();
      fetchQuotations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!selectedQuotation) return;

    try {
      const { error } = await supabase
        .from('quotations')
        .delete()
        .eq('id', selectedQuotation.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Quotation deleted successfully' });
      setDeleteDialogOpen(false);
      fetchQuotations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleStatusChange = async (quotation: Quotation, newStatus: 'draft' | 'sent' | 'approved' | 'converted' | 'rejected' | 'expired' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ status: newStatus as any })
        .eq('id', quotation.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Status updated successfully' });
      fetchQuotations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleConvertToInvoice = async () => {
    if (!selectedQuotation || selectedQuotation.status === 'converted') return;

    try {
      // Generate invoice number
      const { data: numData } = await supabase.rpc('generate_invoice_number');
      const invoiceNumber = numData || `INV-${Date.now()}`;

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          customer_id: selectedQuotation.customer_id,
          subtotal: selectedQuotation.subtotal,
          tax_amount: selectedQuotation.tax_amount,
          total_amount: selectedQuotation.total_amount,
          status: 'draft',
          notes: selectedQuotation.notes,
          terms: selectedQuotation.terms,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Copy items to invoice
      const invoiceItems = selectedQuotation.quotation_items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      // Update quotation status
      const { error: updateError } = await supabase
        .from('quotations')
        .update({ 
          status: 'converted',
          converted_invoice_id: invoice.id 
        })
        .eq('id', selectedQuotation.id);

      if (updateError) throw updateError;

      toast({ 
        title: 'Success', 
        description: `Quotation converted to Invoice ${invoiceNumber}` 
      });
      setConvertDialogOpen(false);
      fetchQuotations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDownloadPDF = (quotation: Quotation) => {
    try {
      generateQuotationPDF(quotation.quotation_number, {
        quotationNumber: quotation.quotation_number,
        quotationDate: format(new Date(quotation.quotation_date), 'MMM dd, yyyy'),
        validUntil: quotation.valid_until ? format(new Date(quotation.valid_until), 'MMM dd, yyyy') : undefined,
        customerName: quotation.customer?.name || 'N/A',
        customerContact: quotation.customer?.phone,
        customerEmail: quotation.customer?.email,
        items: quotation.quotation_items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          amount: item.amount,
        })),
        subtotal: quotation.subtotal,
        discountType: quotation.discount_type,
        discountValue: quotation.discount_value,
        discountAmount: quotation.discount_amount,
        taxRate: quotation.tax_rate,
        taxAmount: quotation.tax_amount,
        totalAmount: quotation.total_amount,
        notes: quotation.notes || undefined,
        terms: quotation.terms || undefined,
        status: quotation.status,
      });
      toast({ title: 'Success', description: 'PDF downloaded successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const openEditDialog = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setFormCustomer(quotation.customer_id);
    setFormValidUntil(quotation.valid_until || '');
    setFormDiscountType(quotation.discount_type);
    setFormDiscountValue(quotation.discount_value.toString());
    setFormTaxRate(quotation.tax_rate.toString());
    setFormNotes(quotation.notes || '');
    setFormTerms(quotation.terms || '');
    setFormItems(quotation.quotation_items.length > 0 ? quotation.quotation_items : [
      { description: '', quantity: 1, unit_price: 0, amount: 0 }
    ]);
    setEditDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'converted': return 'bg-purple-100 text-purple-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-orange-100 text-orange-800';
      case 'cancelled': return 'bg-slate-100 text-slate-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredQuotations = quotations.filter(q => {
    const matchesSearch = q.quotation_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          q.customer?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || q.status === filterStatus;
    const matchesCustomer = filterCustomer === 'all' || q.customer_id === filterCustomer;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const { subtotal, discountAmount, taxAmount, totalAmount } = calculateTotals();

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">Quotations</h1>
            <p className="text-muted-foreground">Manage customer quotations</p>
          </div>
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Quotation
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Draft</p>
              <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Sent</p>
              <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Converted</p>
              <p className="text-2xl font-bold text-purple-600">{stats.converted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
              <p className="text-2xl font-bold text-primary">{stats.conversionRate.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by quotation number or customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full md:w-auto">
                    <Filter className="mr-2 h-4 w-4" />
                    {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: startDate, to: endDate }}
                    onSelect={(range) => {
                      if (range?.from) setStartDate(range.from);
                      if (range?.to) setEndDate(range.to);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Quotations Table */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : filteredQuotations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No quotations found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredQuotations.map((quotation) => (
                      <TableRow key={quotation.id}>
                        <TableCell className="font-medium">{quotation.quotation_number}</TableCell>
                        <TableCell>{quotation.customer?.name}</TableCell>
                        <TableCell>{format(new Date(quotation.quotation_date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          {quotation.valid_until 
                            ? format(new Date(quotation.valid_until), 'MMM dd, yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${quotation.total_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={quotation.status}
                            onValueChange={(value) => handleStatusChange(quotation, value as 'draft' | 'sent' | 'approved' | 'converted' | 'rejected' | 'expired' | 'cancelled')}
                            disabled={quotation.status === 'converted'}
                          >
                            <SelectTrigger className={cn('w-28 h-7 text-xs', getStatusColor(quotation.status))}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setSelectedQuotation(quotation); setViewDialogOpen(true); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadPDF(quotation)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {quotation.status !== 'converted' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(quotation)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => { setSelectedQuotation(quotation); setConvertDialogOpen(true); }}
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setSelectedQuotation(quotation); setDeleteDialogOpen(true); }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={createDialogOpen || editDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditDialogOpen(false);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editDialogOpen ? 'Edit Quotation' : 'Create New Quotation'}</DialogTitle>
              <DialogDescription>
                {editDialogOpen ? 'Update quotation details' : 'Fill in the details to create a new quotation'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <Select value={formCustomer} onValueChange={setFormCustomer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={formValidUntil}
                    onChange={(e) => setFormValidUntil(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Items</Label>
                <div className="space-y-2">
                  {formItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        className="col-span-5"
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="col-span-2"
                        min="1"
                      />
                      <Input
                        type="number"
                        placeholder="Unit Price"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                        className="col-span-2"
                        min="0"
                        step="0.01"
                      />
                      <div className="col-span-2 text-right font-medium">
                        ${item.amount.toFixed(2)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={formItems.length === 1}
                        className="col-span-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addItem} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select value={formDiscountType} onValueChange={setFormDiscountType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discount Value</Label>
                  <Input
                    type="number"
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  value={formTaxRate}
                  onChange={(e) => setFormTaxRate(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount:</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-primary">${totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="space-y-2">
                <Label>Terms & Conditions</Label>
                <Textarea
                  value={formTerms}
                  onChange={(e) => setFormTerms(e.target.value)}
                  placeholder="Terms and conditions..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setCreateDialogOpen(false);
                setEditDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={editDialogOpen ? handleEdit : handleCreate}>
                {editDialogOpen ? 'Update' : 'Create'} Quotation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Quotation Details</DialogTitle>
            </DialogHeader>
            {selectedQuotation && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Quotation Number</Label>
                    <p className="font-medium">{selectedQuotation.quotation_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge className={getStatusColor(selectedQuotation.status)}>
                      {selectedQuotation.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Customer</Label>
                    <p className="font-medium">{selectedQuotation.customer?.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">
                      {format(new Date(selectedQuotation.quotation_date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedQuotation.quotation_items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">${item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${item.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${selectedQuotation.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedQuotation.discount_amount > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Discount:</span>
                      <span>-${selectedQuotation.discount_amount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedQuotation.tax_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Tax ({selectedQuotation.tax_rate}%):</span>
                      <span>${selectedQuotation.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">${selectedQuotation.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                {selectedQuotation.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p>{selectedQuotation.notes}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => selectedQuotation && handleDownloadPDF(selectedQuotation)}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete quotation {selectedQuotation?.quotation_number}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Convert to Invoice Confirmation */}
        <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Convert to Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Convert quotation {selectedQuotation?.quotation_number} to an invoice? This will create a new invoice with the same items and mark this quotation as converted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConvertToInvoice}>
                Convert to Invoice
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default Quotations;