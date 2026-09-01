import { Fragment, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  subDays,
  subMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Printer,
  Loader2,
  Wallet,
  Receipt,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { generatePaymentReportPDF } from '@/utils/generatePaymentReportPDF';

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

interface Allocation {
  paymentRowId: string;
  invoiceId: string | null;
  invoice_number: string;
  invoice_date: string | null;
  original_amount: number;
  previous_balance: number;
  allocated: number;
  discount: number;
  remaining: number;
  status: 'Paid' | 'Partial Paid' | 'Unpaid';
  current_status: string;
}

interface Transaction {
  key: string;
  payment_id: string;
  date: string;
  datetime: string;
  customer: string;
  customerId: string;
  method: string;
  reference: string | null;
  recordedBy: string;
  notes: string | null;
  received: number;
  allocated: number;
  unallocated: number;
  allocations: Allocation[];
}

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAGE_SIZE = 25;

export default function PaymentReport() {
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string }[]>([]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedCustomer, setExpandedCustomer] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [customerSnapshot, setCustomerSnapshot] = useState<{ billed: number; paid: number; outstanding: number } | null>(null);

  const { from, to, label } = useMemo(() => {
    const now = new Date();
    switch (rangeKey) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now), label: `TODAY — ${format(now, 'dd MMM yyyy').toUpperCase()}` };
      case 'yesterday': {
        const y = subDays(now, 1);
        return { from: startOfDay(y), to: endOfDay(y), label: `YESTERDAY — ${format(y, 'dd MMM yyyy').toUpperCase()}` };
      }
      case 'week': {
        const s = startOfWeek(now, { weekStartsOn: 1 });
        return { from: s, to: endOfDay(now), label: `THIS WEEK — ${format(s, 'dd MMM yyyy').toUpperCase()} to ${format(now, 'dd MMM yyyy').toUpperCase()}` };
      }
      case 'month':
        return {
          from: startOfMonth(now),
          to: endOfDay(endOfMonth(now) > now ? now : endOfMonth(now)),
          label: `THIS MONTH — ${format(startOfMonth(now), 'dd MMM yyyy').toUpperCase()} to ${format(now, 'dd MMM yyyy').toUpperCase()}`,
        };
      case 'lastMonth': {
        const s = startOfMonth(subMonths(now, 1));
        const e = endOfMonth(subMonths(now, 1));
        return {
          from: s,
          to: endOfDay(e),
          label: `LAST MONTH — ${format(s, 'dd MMM yyyy').toUpperCase()} to ${format(e, 'dd MMM yyyy').toUpperCase()}`,
        };
      }
      case 'all':
        return { from: new Date('2000-01-01T00:00:00Z'), to: endOfDay(now), label: 'ALL TIME' };
      default: {
        const f = startOfDay(parseISO(customFrom));
        const t = endOfDay(parseISO(customTo));
        return { from: f, to: t, label: `${format(f, 'dd MMM yyyy').toUpperCase()} to ${format(t, 'dd MMM yyyy').toUpperCase()}` };
      }
    }
  }, [rangeKey, customFrom, customTo]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('customers').select('id, name').order('name');
      setAllCustomers((data as any) || []);
    })();
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime(), customerFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Customer accounting snapshot (read-only, mirrors the Customer Report)
      let invoiceIdsForCustomer: string[] | null = null;
      if (customerFilter !== 'all') {
        const { data: invs } = await supabase
          .from('invoices')
          .select('id, total_amount, amount_paid, status')
          .eq('customer_id', customerFilter);
        const list = ((invs as any) || []) as any[];
        invoiceIdsForCustomer = list.map((i) => i.id);
        const nonDraft = list.filter((i) => i.status !== 'draft');
        const billed = nonDraft.reduce((s, i) => s + Number(i.total_amount || 0), 0);
        const paid = nonDraft.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
        setCustomerSnapshot({ billed, paid, outstanding: billed - paid });
      } else {
        setCustomerSnapshot(null);
      }

      // 1. Payments received in the selected period (read-only)
      let query = supabase
        .from('payments')
        .select(
          'id, amount, discount_amount, payment_method, payment_date, reference_number, notes, recorded_by, invoice_id, order_id, invoices:invoice_id(id, invoice_number, invoice_date, total_amount, amount_paid, status, customer_id, customers(name)), orders:order_id(customer_id, job_title, customers(name))',
        )
        .gte('payment_date', from.toISOString())
        .lte('payment_date', to.toISOString());

      if (invoiceIdsForCustomer) {
        if (invoiceIdsForCustomer.length === 0) {
          setTransactions([]);
          setPage(1);
          setLoading(false);
          return;
        }
        query = query.in('invoice_id', invoiceIdsForCustomer);
      }

      const { data: rows, error } = await query.order('payment_date', { ascending: false });

      if (error) throw error;
      const payments = rows || [];

      // 2. Full payment history for the touched invoices (to derive prior balances)
      const invoiceIds = Array.from(
        new Set(payments.map((p: any) => p.invoice_id).filter(Boolean)),
      ) as string[];

      let history: any[] = [];
      if (invoiceIds.length) {
        for (let i = 0; i < invoiceIds.length; i += 200) {
          const chunk = invoiceIds.slice(i, i + 200);
          const { data: h } = await supabase
            .from('payments')
            .select('id, invoice_id, amount, discount_amount, payment_date')
            .in('invoice_id', chunk);
          history = history.concat(h || []);
        }
      }

      // 3. Recorded-by names
      const userIds = Array.from(new Set(payments.map((p: any) => p.recorded_by).filter(Boolean))) as string[];
      const nameById: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        (profs || []).forEach((p: any) => (nameById[p.id] = p.full_name));
      }

      // Prior credits per payment row, ordered chronologically per invoice
      const byInvoice: Record<string, any[]> = {};
      history.forEach((h) => {
        if (!h.invoice_id) return;
        (byInvoice[h.invoice_id] ||= []).push(h);
      });
      Object.values(byInvoice).forEach((list) =>
        list.sort((a, b) => (a.payment_date === b.payment_date ? a.id.localeCompare(b.id) : a.payment_date.localeCompare(b.payment_date))),
      );
      const priorCredit: Record<string, number> = {};
      Object.values(byInvoice).forEach((list) => {
        let running = 0;
        list.forEach((h) => {
          priorCredit[h.id] = running;
          running += Number(h.amount || 0) + Number(h.discount_amount || 0);
        });
      });

      // Group payment rows into real payment transactions
      const groups: Record<string, Transaction> = {};
      payments.forEach((p: any) => {
        const inv = p.invoices;
        const customerId = inv?.customer_id || p.orders?.customer_id || 'unknown';
        const customer = inv?.customers?.name || p.orders?.customers?.name || 'Unknown Customer';
        const ts = p.payment_date as string;
        const minute = ts.slice(0, 16);
        const key = `${customerId}|${p.reference_number || '-'}|${p.payment_method}|${minute}`;

        if (!groups[key]) {
          groups[key] = {
            key,
            payment_id: `PAY-${String(p.id).slice(0, 8).toUpperCase()}`,
            date: format(parseISO(ts), 'dd MMM yyyy'),
            datetime: format(parseISO(ts), 'dd MMM yyyy HH:mm'),
            customer,
            customerId,
            method: String(p.payment_method || '').replace(/_/g, ' '),
            reference: p.reference_number,
            recordedBy: p.recorded_by ? nameById[p.recorded_by] || '—' : '—',
            notes: p.notes,
            received: 0,
            allocated: 0,
            unallocated: 0,
            allocations: [],
          };
        }

        const g = groups[key];
        const amount = Number(p.amount || 0);
        const discount = Number(p.discount_amount || 0);
        g.received += amount;

        if (inv) {
          g.allocated += amount;
          const original = Number(inv.total_amount || 0);
          const before = priorCredit[p.id] ?? 0;
          const previous_balance = Math.max(0, original - before);
          const remaining = Math.max(0, previous_balance - amount - discount);
          g.allocations.push({
            paymentRowId: p.id,
            invoiceId: inv.id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            original_amount: original,
            previous_balance,
            allocated: amount,
            discount,
            remaining,
            status: remaining <= 0.005 ? 'Paid' : amount > 0 ? 'Partial Paid' : 'Unpaid',
            current_status: inv.status,
          });
        } else {
          g.unallocated += amount;
        }
      });

      const list = Object.values(groups).sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
      setTransactions(list);
      setPage(1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load payment report');
    } finally {
      setLoading(false);
    }
  };

  const selectedCustomerName = useMemo(
    () => allCustomers.find((c) => c.id === customerFilter)?.name || '',
    [allCustomers, customerFilter],
  );

  const methods = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.method))).sort(),
    [transactions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (methodFilter !== 'all' && t.method !== methodFilter) return false;
      if (customerFilter !== 'all' && t.customerId !== customerFilter) return false;
      if (!q) return true;
      return (
        t.payment_id.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        (t.reference || '').toLowerCase().includes(q) ||
        t.allocations.some((a) => a.invoice_number.toLowerCase().includes(q))
      );
    });
  }, [transactions, search, methodFilter, customerFilter]);

  const summary = useMemo(() => {
    const totalReceived = filtered.reduce((s, t) => s + t.received, 0);
    const totalAllocated = filtered.reduce((s, t) => s + t.allocated, 0);
    const totalUnallocated = filtered.reduce((s, t) => s + t.unallocated, 0);
    const invoiceIds = new Set<string>();
    let paidAllocations = 0;
    let partialAllocations = 0;
    filtered.forEach((t) =>
      t.allocations.forEach((a) => {
        if (a.invoiceId) invoiceIds.add(a.invoiceId);
        if (a.status === 'Paid') paidAllocations += a.allocated;
        else partialAllocations += a.allocated;
      }),
    );
    const methodBreakdown = Object.entries(
      filtered.reduce((acc: Record<string, number>, t) => {
        acc[t.method || 'other'] = (acc[t.method || 'other'] || 0) + t.received;
        return acc;
      }, {}),
    )
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalReceived,
      totalAllocated,
      totalUnallocated,
      paymentCount: filtered.length,
      invoicesAffected: invoiceIds.size,
      paidAllocations,
      partialAllocations,
      methodBreakdown,
      discrepancy: totalReceived - (totalAllocated + totalUnallocated),
    };
  }, [filtered]);

  const customerBreakdown = useMemo(() => {
    const map: Record<string, { customer: string; received: number; allocated: number; unallocated: number; invoices: Set<string>; txs: Transaction[] }> = {};
    filtered.forEach((t) => {
      const m = (map[t.customer] ||= {
        customer: t.customer,
        received: 0,
        allocated: 0,
        unallocated: 0,
        invoices: new Set<string>(),
        txs: [],
      });
      m.received += t.received;
      m.allocated += t.allocated;
      m.unallocated += t.unallocated;
      m.txs.push(t);
      t.allocations.forEach((a) => a.invoiceId && m.invoices.add(a.invoiceId));
    });
    return Object.values(map).sort((a, b) => b.received - a.received);
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push('PAYMENT ALLOCATION REPORT');
    lines.push(label);
    lines.push('');
    lines.push('Total Received,Total Allocated,Total Unallocated,Payments,Invoices Affected');
    lines.push(
      `${summary.totalReceived.toFixed(2)},${summary.totalAllocated.toFixed(2)},${summary.totalUnallocated.toFixed(2)},${summary.paymentCount},${summary.invoicesAffected}`,
    );
    lines.push('');
    lines.push(
      'Date,Payment ID,Customer,Method,Amount Received,Allocated,Unallocated,Invoice,Original Amount,Previous Balance,Amount Allocated,Remaining Balance,Status',
    );
    filtered.forEach((t) => {
      if (!t.allocations.length) {
        lines.push(
          `${t.date},${t.payment_id},"${t.customer}",${t.method},${t.received.toFixed(2)},${t.allocated.toFixed(2)},${t.unallocated.toFixed(2)},,,,,,`,
        );
      }
      t.allocations.forEach((a) => {
        lines.push(
          `${t.date},${t.payment_id},"${t.customer}",${t.method},${t.received.toFixed(2)},${t.allocated.toFixed(2)},${t.unallocated.toFixed(2)},${a.invoice_number},${a.original_amount.toFixed(2)},${a.previous_balance.toFixed(2)},${a.allocated.toFixed(2)},${a.remaining.toFixed(2)},${a.status}`,
        );
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payment-Report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const exportPDF = () => {
    generatePaymentReportPDF(
      {
        periodLabel: label,
        totalReceived: summary.totalReceived,
        paymentCount: summary.paymentCount,
        totalAllocated: summary.totalAllocated,
        totalUnallocated: summary.totalUnallocated,
        invoicesAffected: summary.invoicesAffected,
        paidAllocations: summary.paidAllocations,
        partialAllocations: summary.partialAllocations,
        methodBreakdown: summary.methodBreakdown,
      },
      filtered.map((t) => ({
        payment_id: t.payment_id,
        date: t.date,
        customer: t.customer,
        method: t.method,
        received: t.received,
        allocated: t.allocated,
        unallocated: t.unallocated,
        allocations: t.allocations.map((a) => ({
          invoice_number: a.invoice_number,
          original_amount: a.original_amount,
          previous_balance: a.previous_balance,
          allocated: a.allocated,
          remaining: a.remaining,
          status: a.status,
        })),
      })),
    );
    toast.success('PDF downloaded');
  };

  const statusBadge = (status: string) => {
    if (status === 'Paid') return <Badge className="bg-green-600 hover:bg-green-600 text-white">Paid</Badge>;
    if (status === 'Partial Paid')
      return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Partial Paid</Badge>;
    return <Badge variant="secondary">Unpaid</Badge>;
  };

  return (
    <Layout>
      <div className="space-y-6 overflow-x-hidden min-w-0 print:space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Payment Report</h1>
            <p className="text-sm text-muted-foreground">
              Money received and exactly how it was allocated to invoices
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="lastMonth">Last Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {rangeKey === 'custom' && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
            <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {allCustomers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Payment ID, invoice, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <p className="text-sm font-semibold text-muted-foreground">
          PAYMENT ALLOCATION REPORT — {label}
          {customerFilter !== 'all' ? ` • ${selectedCustomerName}` : ''}
        </p>

        {customerSnapshot && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer Accounting Snapshot — {selectedCustomerName}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Total Billed</p><p className="font-semibold">{money(customerSnapshot.billed)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Paid</p><p className="font-semibold">{money(customerSnapshot.paid)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Outstanding</p><p className="font-semibold">{money(customerSnapshot.outstanding)}</p></div>
              <p className="sm:col-span-3 text-xs text-muted-foreground">
                Read from the existing customer accounting records (informational only — not changed by this report).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Hero metric + summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 border-primary/40 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-4 w-4" /> Total Money Received
              </div>
              <div className="text-4xl font-bold text-primary mt-2 break-words">
                {money(summary.totalReceived)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {summary.paymentCount} payment{summary.paymentCount === 1 ? '' : 's'}
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Allocated', value: money(summary.totalAllocated) },
              { label: 'Unallocated', value: money(summary.totalUnallocated) },
              { label: 'Invoices Affected', value: `${summary.invoicesAffected}` },
              { label: 'Paid Allocations', value: money(summary.paidAllocations) },
              { label: 'Partial Allocations', value: money(summary.partialAllocations) },
              { label: 'Number of Payments', value: `${summary.paymentCount}` },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  <p className="text-lg font-semibold break-words">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Reconciliation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reconciliation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Total Payment Received</span><span className="font-semibold">{money(summary.totalReceived)}</span></div>
            <div className="flex justify-between"><span>− Allocated to Invoices</span><span>{money(summary.totalAllocated)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-medium">= Unallocated</span><span className="font-semibold">{money(summary.totalUnallocated)}</span></div>
            {Math.abs(summary.discrepancy) > 0.005 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Allocation discrepancy detected: {money(Math.abs(summary.discrepancy))}. No accounting data was changed.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="payments">
          <TabsList className="print:hidden">
            <TabsTrigger value="payments">Payment Transactions</TabsTrigger>
            <TabsTrigger value="customers">Customer Breakdown</TabsTrigger>
            <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filtered.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    No payments received in this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Date</TableHead>
                          <TableHead>Payment ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount Received</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Unallocated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((t) => (
                          <Fragment key={t.key}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => setExpanded((p) => ({ ...p, [t.key]: !p[t.key] }))}
                            >
                              <TableCell>
                                {expanded[t.key] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                              <TableCell className="font-mono text-xs">{t.payment_id}</TableCell>
                              <TableCell className="max-w-[180px] truncate">{t.customer}</TableCell>
                              <TableCell className="capitalize">{t.method}</TableCell>
                              <TableCell className="text-right font-semibold">{money(t.received)}</TableCell>
                              <TableCell className="text-right">{money(t.allocated)}</TableCell>
                              <TableCell className="text-right">{money(t.unallocated)}</TableCell>
                            </TableRow>
                            {expanded[t.key] && (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-muted/40">
                                  <div className="space-y-4 p-2">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                      <div><p className="text-xs text-muted-foreground">Payment ID</p><p className="font-mono">{t.payment_id}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Date & Time</p><p>{t.datetime}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Customer</p><p className="truncate">{t.customer}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Method</p><p className="capitalize">{t.method}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Reference</p><p>{t.reference || '—'}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Recorded By</p><p className="truncate">{t.recordedBy}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Received</p><p className="font-semibold">{money(t.received)}</p></div>
                                      <div><p className="text-xs text-muted-foreground">Allocated / Unallocated</p><p>{money(t.allocated)} / {money(t.unallocated)}</p></div>
                                    </div>

                                    <div>
                                      <p className="text-sm font-semibold mb-2">Invoice Allocation Details</p>
                                      <div className="overflow-x-auto">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Invoice</TableHead>
                                              <TableHead>Invoice Date</TableHead>
                                              <TableHead className="text-right">Original Amount</TableHead>
                                              <TableHead className="text-right">Previous Balance</TableHead>
                                              <TableHead className="text-right">Allocated</TableHead>
                                              <TableHead className="text-right">Remaining Balance</TableHead>
                                              <TableHead>Status</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {t.allocations.length === 0 ? (
                                              <TableRow>
                                                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                                                  This payment is not linked to any invoice (unallocated).
                                                </TableCell>
                                              </TableRow>
                                            ) : (
                                              t.allocations.map((a) => (
                                                <TableRow key={a.paymentRowId}>
                                                  <TableCell className="font-medium">{a.invoice_number}</TableCell>
                                                  <TableCell>{a.invoice_date ? format(parseISO(a.invoice_date), 'dd MMM yyyy') : '—'}</TableCell>
                                                  <TableCell className="text-right">{money(a.original_amount)}</TableCell>
                                                  <TableCell className="text-right">{money(a.previous_balance)}</TableCell>
                                                  <TableCell className="text-right font-semibold">{money(a.allocated)}</TableCell>
                                                  <TableCell className="text-right">{money(a.remaining)}</TableCell>
                                                  <TableCell>{statusBadge(a.status)}</TableCell>
                                                </TableRow>
                                              ))
                                            )}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-4 text-sm border-t pt-3">
                                      <span>Payment Received: <b>{money(t.received)}</b></span>
                                      <span>Total Allocated: <b>{money(t.allocated)}</b></span>
                                      <span>Unallocated: <b>{money(t.unallocated)}</b></span>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-3 print:hidden">
                <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Payments Received</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Unallocated</TableHead>
                      <TableHead className="text-right">Invoices Affected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerBreakdown.map((c) => (
                      <Fragment key={c.customer}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandedCustomer((p) => ({ ...p, [c.customer]: !p[c.customer] }))}
                        >
                          <TableCell>{expandedCustomer[c.customer] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{c.customer}</TableCell>
                          <TableCell className="text-right font-semibold">{money(c.received)}</TableCell>
                          <TableCell className="text-right">{money(c.allocated)}</TableCell>
                          <TableCell className="text-right">{money(c.unallocated)}</TableCell>
                          <TableCell className="text-right">{c.invoices.size}</TableCell>
                        </TableRow>
                        {expandedCustomer[c.customer] && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/40">
                              <div className="space-y-3 p-2">
                                {c.txs.map((t) => (
                                  <div key={t.key} className="rounded-md border bg-background p-3">
                                    <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
                                      <span>{t.payment_id} • {t.datetime} • <span className="capitalize">{t.method}</span></span>
                                      <span>Received {money(t.received)}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-sm">
                                      {t.allocations.map((a) => (
                                        <div key={a.paymentRowId} className="flex flex-wrap justify-between gap-2">
                                          <span className="truncate">
                                            {a.invoice_number} — Original {money(a.original_amount)} | Before {money(a.previous_balance)} | Applied {money(a.allocated)} | Remaining {money(a.remaining)}
                                          </span>
                                          {statusBadge(a.status)}
                                        </div>
                                      ))}
                                      {t.allocations.length === 0 && (
                                        <p className="text-muted-foreground">Unallocated payment</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="methods" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Payment Method Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.methodBreakdown.map((m) => (
                  <div key={m.method} className="flex justify-between text-sm border-b pb-2 last:border-0">
                    <span className="capitalize">{m.method}</span>
                    <span className="font-semibold">{money(m.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold">
                  <span>Total</span>
                  <span>{money(summary.totalReceived)}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
