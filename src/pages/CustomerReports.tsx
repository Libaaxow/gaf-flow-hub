import { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, Download, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generateCustomerReportPDF } from '@/utils/generateCustomerReportPDF';
import { Badge } from '@/components/ui/badge';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number?: string;
  notes?: string;
}

interface ReportInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  order_id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  order?: {
    job_title: string;
    description: string;
    payments?: Payment[];
  };
  invoice_items: InvoiceItem[];
}

interface CustomerInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

const CustomerReports = () => {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<CustomerInfo[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [invoiceStatus, setInvoiceStatus] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [reportData, setReportData] = useState<ReportInvoice[] | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);

  // Auto-select customer from URL parameter
  useEffect(() => {
    const customerId = searchParams.get('customer');
    if (customerId) {
      setSelectedCustomerId(customerId);
      setAutoGenerate(true);
      // Fetch customer info to populate the select
      const fetchCustomer = async () => {
        try {
          const { data, error } = await supabase
            .from('customers')
            .select('id, name, email, phone, company_name')
            .eq('id', customerId)
            .single();
          
          if (error) throw error;
          if (data) {
            setCustomers([data]);
          }
        } catch (error) {
          console.error('Error fetching customer:', error);
        }
      };
      fetchCustomer();
    }
  }, [searchParams]);

  // Auto-generate report when customer is pre-selected from URL
  useEffect(() => {
    if (autoGenerate && selectedCustomerId && customers.length > 0) {
      generateReport();
      setAutoGenerate(false); // Reset flag after auto-generating
    }
  }, [autoGenerate, selectedCustomerId, customers]);

  const fetchCustomers = async (search: string = '') => {
    setLoadingCustomers(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, name, email, phone, company_name')
        .order('name', { ascending: true });
      
      if (search && search.length >= 2) {
        query = query.ilike('name', `%${search}%`);
      }
      
      const { data, error } = await query.limit(50);

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch customers',
        variant: 'destructive',
      });
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Fetch all customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  const generateReport = async () => {
    if (!selectedCustomerId) {
      toast({
        title: 'Error',
        description: 'Please select a customer',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Build query
      let query = supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          order_id,
          status,
          subtotal,
          tax_amount,
          total_amount,
          amount_paid,
          orders (
            job_title,
            description,
            payments (
              id,
              amount,
              payment_method,
              payment_date,
              reference_number,
              notes
            )
          ),
          invoice_items (
            id,
            description,
            quantity,
            unit_price,
            amount
          )
        `)
        .eq('customer_id', selectedCustomerId)
        .order('invoice_date', { ascending: false });

      // Apply filters
      if (dateFrom) {
        query = query.gte('invoice_date', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('invoice_date', format(dateTo, 'yyyy-MM-dd'));
      }
      if (invoiceStatus && invoiceStatus !== 'all') {
        console.log('Filtering by status:', invoiceStatus);
        query = query.eq('status', invoiceStatus);
      }
      if (minAmount) {
        query = query.gte('total_amount', parseFloat(minAmount));
      }
      if (maxAmount) {
        query = query.lte('total_amount', parseFloat(maxAmount));
      }

      const { data: invoices, error: invoicesError } = await query;
      if (invoicesError) throw invoicesError;

      // Fetch customer info
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', selectedCustomerId)
        .single();

      if (customerError) throw customerError;

      setReportData(invoices as ReportInvoice[]);
      setCustomerInfo(customer);

      toast({
        title: 'Success',
        description: 'Report generated successfully',
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleInvoiceExpand = (invoiceId: string) => {
    const newExpanded = new Set(expandedInvoices);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId);
    } else {
      newExpanded.add(invoiceId);
    }
    setExpandedInvoices(newExpanded);
  };

  const handleExportPDF = async () => {
    if (!reportData || !customerInfo) return;

    setGeneratingPDF(true);
    try {
      await generateCustomerReportPDF(reportData, customerInfo, {
        dateFrom,
        dateTo,
        invoiceStatus,
        minAmount,
        maxAmount,
      });
      
      toast({
        title: 'Success',
        description: 'PDF report generated successfully',
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

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      paid: { label: 'PAID', variant: 'default' },
      pending: { label: 'PENDING', variant: 'secondary' },
      overdue: { label: 'OVERDUE', variant: 'destructive' },
      draft: { label: 'DRAFT', variant: 'outline' },
    };
    const statusInfo = statusMap[status] || { label: status.toUpperCase(), variant: 'outline' as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const totalBilled = reportData?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
  const totalPaid = reportData?.reduce((sum, inv) => sum + Number(inv.amount_paid), 0) || 0;
  const outstanding = totalBilled - totalPaid;
  const avgOrderValue = reportData && reportData.length > 0 ? totalBilled / reportData.length : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customer Reports</h1>
            <p className="text-muted-foreground">Generate detailed invoice reports for customers</p>
          </div>
          {reportData && (
            <Button onClick={handleExportPDF} disabled={generatingPDF}>
              {generatingPDF ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-background mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </>
              )}
            </Button>
          )}
        </div>

        {/* Filter Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Filter Criteria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Customer Selection */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <Input
                  placeholder="Search customer by name..."
                  onChange={(e) => fetchCustomers(e.target.value)}
                  onFocus={() => {
                    if (customers.length === 0) fetchCustomers();
                  }}
                />
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingCustomers ? (
                      <SelectItem value="loading" disabled>
                        Loading customers...
                      </SelectItem>
                    ) : customers.length > 0 ? (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        No customers found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
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
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date To */}
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
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Invoice Status */}
              <div className="space-y-2">
                <Label>Invoice Status</Label>
                <Select value={invoiceStatus} onValueChange={setInvoiceStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Min Amount */}
              <div className="space-y-2">
                <Label>Min Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>

              {/* Max Amount */}
              <div className="space-y-2">
                <Label>Max Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="10000.00"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={generateReport} disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-background mr-2" />
                  Generating Report...
                </>
              ) : (
                'Generate Report'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Report Results */}
        {reportData && customerInfo && (
          <div className="space-y-6">
            {/* Customer Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Customer Name</p>
                      <p className="text-lg font-semibold">{customerInfo.name}</p>
                    </div>
                    {customerInfo.company_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="text-lg font-semibold">{customerInfo.company_name}</p>
                      </div>
                    )}
                    {customerInfo.email && (
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="text-lg">{customerInfo.email}</p>
                      </div>
                    )}
                    {customerInfo.phone && (
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="text-lg">{customerInfo.phone}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Total Invoices</p>
                      <p className="text-2xl font-bold">{reportData.length}</p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Total Billed</p>
                      <p className="text-2xl font-bold text-primary">${totalBilled.toFixed(2)}</p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Total Paid</p>
                      <p className="text-2xl font-bold text-success">${totalPaid.toFixed(2)}</p>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Outstanding</p>
                      <p className="text-2xl font-bold text-destructive">${outstanding.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Invoice Table */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Details</CardTitle>
              </CardHeader>
              <CardContent>
                {reportData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No invoices found matching the criteria</p>
                ) : (
                  <div className="space-y-2">
                    {reportData.map((invoice) => (
                      <div key={invoice.id} className="border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => toggleInvoiceExpand(invoice.id)}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            {expandedInvoices.has(invoice.id) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Invoice #</p>
                                <p className="font-semibold">{invoice.invoice_number}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Date</p>
                                <p>{format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Order</p>
                                <p className="truncate">{invoice.order?.job_title || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total</p>
                                <p className="font-semibold">${invoice.total_amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Paid</p>
                                <p className="font-semibold text-success">${invoice.amount_paid.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Status</p>
                                {getStatusBadge(invoice.status)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {expandedInvoices.has(invoice.id) && (
                          <div className="p-4 bg-muted/20 border-t space-y-4">
                            <div>
                              <h4 className="font-semibold mb-3">Invoice Items</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 px-2 text-sm font-semibold">Description</th>
                                      <th className="text-center py-2 px-2 text-sm font-semibold">Qty</th>
                                      <th className="text-right py-2 px-2 text-sm font-semibold">Unit Price</th>
                                      <th className="text-right py-2 px-2 text-sm font-semibold">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoice.invoice_items.map((item) => (
                                      <tr key={item.id} className="border-b last:border-0">
                                        <td className="py-2 px-2">{item.description}</td>
                                        <td className="py-2 px-2 text-center">{item.quantity}</td>
                                        <td className="py-2 px-2 text-right">${item.unit_price.toFixed(2)}</td>
                                        <td className="py-2 px-2 text-right font-semibold">${item.amount.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t font-semibold">
                                      <td colSpan={3} className="py-2 px-2 text-right">Subtotal:</td>
                                      <td className="py-2 px-2 text-right">${invoice.subtotal.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                      <td colSpan={3} className="py-2 px-2 text-right text-muted-foreground">Tax:</td>
                                      <td className="py-2 px-2 text-right">${invoice.tax_amount.toFixed(2)}</td>
                                    </tr>
                                    <tr className="font-bold text-primary">
                                      <td colSpan={3} className="py-2 px-2 text-right">Total:</td>
                                      <td className="py-2 px-2 text-right">${invoice.total_amount.toFixed(2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>

                            {invoice.order?.payments && invoice.order.payments.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-3">Payment History</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-2 px-2 text-sm font-semibold">Date</th>
                                        <th className="text-left py-2 px-2 text-sm font-semibold">Method</th>
                                        <th className="text-right py-2 px-2 text-sm font-semibold">Amount</th>
                                        <th className="text-left py-2 px-2 text-sm font-semibold">Reference</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invoice.order.payments.map((payment) => (
                                        <tr key={payment.id} className="border-b last:border-0">
                                          <td className="py-2 px-2">{format(new Date(payment.payment_date), 'MMM dd, yyyy')}</td>
                                          <td className="py-2 px-2 capitalize">{payment.payment_method.replace('_', ' ')}</td>
                                          <td className="py-2 px-2 text-right font-semibold text-success">${payment.amount.toFixed(2)}</td>
                                          <td className="py-2 px-2">{payment.reference_number || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals & Insights */}
            <Card>
              <CardHeader>
                <CardTitle>Summary & Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-1">Average Order Value</p>
                    <p className="text-2xl font-bold text-primary">${avgOrderValue.toFixed(2)}</p>
                  </div>
                  <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                    <p className="text-sm text-muted-foreground mb-1">Payment Rate</p>
                    <p className="text-2xl font-bold text-success">
                      {totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                    <p className="text-2xl font-bold">{reportData.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CustomerReports;
