import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Party { id: string; name: string }
interface OpenInvoice { id: string; invoice_number: string; invoice_date: string; total_amount: number; amount_paid: number }
interface OpenBill { id: string; bill_number: string; bill_date: string; total_amount: number; amount_paid: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ContraSettlementPanel = ({ onProcessed }: { onProcessed?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [vendors, setVendors] = useState<Party[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [offset, setOffset] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: c }, { data: v }] = await Promise.all([
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('vendors').select('id, name').eq('status', 'active').order('name'),
      ]);
      setCustomers(c || []);
      setVendors(v || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!customerId) { setInvoices([]); setSelectedInvoices([]); return; }
    (async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, amount_paid')
        .eq('customer_id', customerId)
        .eq('is_draft', false)
        .order('invoice_date');
      const openOnes = (data || []).filter(i => round2(Number(i.total_amount) - Number(i.amount_paid)) > 0) as OpenInvoice[];
      setInvoices(openOnes);
      setSelectedInvoices(openOnes.map(i => i.id));
    })();
  }, [customerId]);

  useEffect(() => {
    if (!vendorId) { setBills([]); setSelectedBills([]); return; }
    (async () => {
      const { data } = await supabase
        .from('vendor_bills')
        .select('id, bill_number, bill_date, total_amount, amount_paid')
        .eq('vendor_id', vendorId)
        .in('status', ['unpaid', 'partially_paid'])
        .order('bill_date');
      const openOnes = (data || []).filter(b => round2(Number(b.total_amount) - Number(b.amount_paid)) > 0) as OpenBill[];
      setBills(openOnes);
      setSelectedBills(openOnes.map(b => b.id));
    })();
  }, [vendorId]);

  // Suggest the matching vendor for the chosen customer name
  const sortedVendors = useMemo(() => {
    const customerName = customers.find(c => c.id === customerId)?.name?.toLowerCase().trim();
    if (!customerName) return vendors;
    const score = (n: string) => {
      const v = n.toLowerCase().trim();
      if (v === customerName) return 0;
      if (v.includes(customerName) || customerName.includes(v)) return 1;
      return 2;
    };
    return [...vendors].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name));
  }, [vendors, customers, customerId]);

  useEffect(() => {
    if (!customerId || vendorId) return;
    const customerName = customers.find(c => c.id === customerId)?.name?.toLowerCase().trim();
    const match = vendors.find(v => v.name.toLowerCase().trim() === customerName);
    if (match) setVendorId(match.id);
  }, [customerId, customers, vendors, vendorId]);

  const dueInvoices = invoices.filter(i => selectedInvoices.includes(i.id));
  const dueBills = bills.filter(b => selectedBills.includes(b.id));
  const totalReceivable = round2(dueInvoices.reduce((s, i) => s + (Number(i.total_amount) - Number(i.amount_paid)), 0));
  const totalPayable = round2(dueBills.reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0));
  const maxOffset = round2(Math.min(totalReceivable, totalPayable));

  useEffect(() => {
    setOffset(maxOffset > 0 ? maxOffset.toFixed(2) : '');
  }, [maxOffset]);

  const offsetAmount = round2(Math.min(parseFloat(offset || '0') || 0, maxOffset));

  // Oldest-first allocation preview
  const allocate = <T extends { id: string; total_amount: number; amount_paid: number }>(rows: T[]) => {
    let remaining = offsetAmount;
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (remaining <= 0) break;
      const due = round2(Number(r.total_amount) - Number(r.amount_paid));
      const applied = round2(Math.min(due, remaining));
      if (applied > 0) { map[r.id] = applied; remaining = round2(remaining - applied); }
    }
    return map;
  };
  const invoiceAlloc = allocate(dueInvoices);
  const billAlloc = allocate(dueBills);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const reset = () => {
    setCustomerId(''); setVendorId(''); setInvoices([]); setBills([]);
    setSelectedInvoices([]); setSelectedBills([]); setOffset(''); setNotes('');
  };

  const process = async () => {
    if (!user) return;
    if (!customerId || !vendorId) {
      toast({ title: 'Missing selection', description: 'Choose both the customer side and the vendor side.', variant: 'destructive' });
      return;
    }
    if (offsetAmount <= 0) {
      toast({ title: 'Nothing to offset', description: 'There is no common amount between the two sides.', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const reference = `CONTRA-${format(new Date(), 'yyyyMMdd-HHmmss')}`;
      const today = format(new Date(), 'yyyy-MM-dd');

      const { error: headerError } = await supabase.from('contra_settlements').insert({
        reference,
        customer_id: customerId,
        vendor_id: vendorId,
        amount: offsetAmount,
        notes: notes || null,
        created_by: user.id,
      });
      if (headerError) throw headerError;

      // Customer side: payments against invoices
      const invoiceRows = Object.entries(invoiceAlloc).map(([invoice_id, amount]) => ({
        invoice_id,
        amount,
        payment_method: 'contra' as const,
        payment_date: new Date().toISOString(),
        reference_number: reference,
        notes: `Paid via Contra Offset (${reference})`,
        recorded_by: user.id,
        is_contra: true,
        contra_reference: reference,
      }));
      if (invoiceRows.length) {
        const { error } = await supabase.from('payments').insert(invoiceRows);
        if (error) throw error;
      }

      // Vendor side: vendor payments against bills (no expense — no cash moved)
      for (const [vendor_bill_id, amount] of Object.entries(billAlloc)) {
        const { data: paymentNumber } = await supabase.rpc('generate_vendor_payment_number');
        const { error } = await supabase.from('vendor_payments').insert({
          payment_number: paymentNumber as string,
          vendor_id: vendorId,
          vendor_bill_id,
          amount,
          payment_date: today,
          payment_method: 'contra',
          reference_number: reference,
          notes: `Cleared via Contra Offset (${reference})`,
          recorded_by: user.id,
          is_contra: true,
          contra_reference: reference,
        });
        if (error) throw error;
      }

      const invoiceLabels = dueInvoices.filter(i => invoiceAlloc[i.id]).map(i => `#${i.invoice_number}`).join(', ');
      const billLabels = dueBills.filter(b => billAlloc[b.id]).map(b => `#${b.bill_number}`).join(', ');

      await supabase.from('activity_log').insert({
        entity_type: 'contra_settlement',
        entity_id: customerId,
        actor_id: user.id,
        action: 'contra_settlement_processed',
        details: {
          message: `Contra Settlement Processed: Offset $${offsetAmount.toFixed(2)} against Invoice ${invoiceLabels || 'n/a'} and Bill ${billLabels || 'n/a'}`,
          reference,
          amount: offsetAmount,
          customer_id: customerId,
          vendor_id: vendorId,
          invoices: invoiceAlloc,
          bills: billAlloc,
        },
      });

      toast({
        title: 'Contra offset processed',
        description: `$${offsetAmount.toFixed(2)} cleared on both sides (${reference}).`,
      });
      reset();
      setOpen(false);
      onProcessed?.();
    } catch (error: any) {
      toast({ title: 'Could not process offset', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Contra Settlement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contra Settlement / Offset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer side *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendor side *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {sortedVendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">${totalReceivable.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">They owe us (receivable)</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">${totalPayable.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">We owe them (payable)</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">${maxOffset.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Possible offset</p>
            </CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 min-w-0">
            <Card className="min-w-0">
              <CardHeader className="pb-2"><CardTitle className="text-base">Unpaid invoices</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {invoices.length === 0 && <p className="text-sm text-muted-foreground">No open invoices.</p>}
                {invoices.map(i => {
                  const due = round2(Number(i.total_amount) - Number(i.amount_paid));
                  const applied = invoiceAlloc[i.id] || 0;
                  return (
                    <div key={i.id} className="flex items-start gap-2 border-b pb-2 last:border-0 min-w-0">
                      <Checkbox checked={selectedInvoices.includes(i.id)} onCheckedChange={() => toggle(selectedInvoices, setSelectedInvoices, i.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm truncate">{i.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(i.invoice_date), 'MMM d, yyyy')} · due ${due.toFixed(2)}</p>
                        {applied > 0 && (
                          <p className="text-xs text-green-600">Offset ${applied.toFixed(2)} · remaining ${round2(due - applied).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="pb-2"><CardTitle className="text-base">Unpaid vendor bills</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {bills.length === 0 && <p className="text-sm text-muted-foreground">No open bills.</p>}
                {bills.map(b => {
                  const due = round2(Number(b.total_amount) - Number(b.amount_paid));
                  const applied = billAlloc[b.id] || 0;
                  return (
                    <div key={b.id} className="flex items-start gap-2 border-b pb-2 last:border-0 min-w-0">
                      <Checkbox checked={selectedBills.includes(b.id)} onCheckedChange={() => toggle(selectedBills, setSelectedBills, b.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm truncate">{b.bill_number}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(b.bill_date), 'MMM d, yyyy')} · due ${due.toFixed(2)}</p>
                        {applied > 0 && (
                          <p className="text-xs text-green-600">Cleared ${applied.toFixed(2)} · remaining ${round2(due - applied).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Offset amount *</Label>
              <Input
                type="number"
                step="0.01"
                max={maxOffset}
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Cannot exceed ${maxOffset.toFixed(2)}.</p>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2">No cash movement</Badge>
            This offset clears both documents against each other, so it is not recorded as a cash expense.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={process} disabled={processing || offsetAmount <= 0}>
            {processing ? 'Processing...' : `Process Contra Offset ($${offsetAmount.toFixed(2)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContraSettlementPanel;
