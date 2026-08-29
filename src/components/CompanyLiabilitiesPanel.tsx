import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Landmark, Plus, Trash2, Banknote, FileDown, Eye, X } from 'lucide-react';
import { defaultDueDate } from '@/utils/dueDate';
import {
  generateLiabilityPDF,
  generateLiabilitiesReportPDF,
  type LiabilityItemRow,
} from '@/utils/generateLiabilitiesReportPDF';

interface Liability {
  id: string;
  title: string;
  vendor_name: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  items?: LiabilityItemRow[];
}

interface FormItem {
  item_name: string;
  quantity: string;
  unit_price: string;
}

const emptyItem = (): FormItem => ({ item_name: '', quantity: '1', unit_price: '' });

const statusOf = (amount: number, paid: number) =>
  paid <= 0 ? 'unpaid' : paid >= amount ? 'paid' : 'partially_paid';

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
  status === 'paid' ? 'default' : status === 'partially_paid' ? 'secondary' : 'destructive';

export function CompanyLiabilitiesPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<Liability | null>(null);
  const [payTarget, setPayTarget] = useState<Liability | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Liability | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', vendor_name: '', due_date: defaultDueDate() });
  const [lineItems, setLineItems] = useState<FormItem[]>([emptyItem()]);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('company_liabilities')
      .select('id, title, vendor_name, amount, paid_amount, due_date, status')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Could not load liabilities', description: error.message, variant: 'destructive' });

    const list = (data || []) as Liability[];

    if (list.length > 0) {
      const { data: itemRows } = await supabase
        .from('company_liability_items')
        .select('liability_id, item_name, quantity, unit_price, line_total')
        .in('liability_id', list.map(l => l.id))
        .order('created_at', { ascending: true });

      const byId: Record<string, LiabilityItemRow[]> = {};
      (itemRows || []).forEach((r: any) => {
        (byId[r.liability_id] ||= []).push({
          item_name: r.item_name,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
          line_total: Number(r.line_total),
        });
      });
      list.forEach(l => { l.items = byId[l.id] || []; });
    }

    setItems(list);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const totalOutstanding = items.reduce((s, i) => s + Math.max(0, (i.amount || 0) - (i.paid_amount || 0)), 0);
  const totalPaid = items.reduce((s, i) => s + (i.paid_amount || 0), 0);

  const lineTotal = (li: FormItem) => (parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0);
  const formTotal = lineItems.reduce((s, li) => s + lineTotal(li), 0);

  const updateLine = (idx: number, patch: Partial<FormItem>) =>
    setLineItems(prev => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));

  const resetForm = () => {
    setForm({ title: '', vendor_name: '', due_date: defaultDueDate() });
    setLineItems([emptyItem()]);
  };

  const handleAdd = async () => {
    const valid = lineItems.filter(li => li.item_name.trim() && lineTotal(li) > 0);
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (valid.length === 0) {
      toast({ title: 'Add at least one item with a price', variant: 'destructive' });
      return;
    }
    const amount = valid.reduce((s, li) => s + lineTotal(li), 0);

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from('company_liabilities').insert({
      title: form.title.trim(),
      vendor_name: form.vendor_name.trim() || null,
      amount,
      paid_amount: 0,
      due_date: form.due_date || null,
      status: 'unpaid',
      created_by: userRes.user?.id ?? null,
    }).select('id').single();

    if (error || !inserted) {
      setSaving(false);
      toast({ title: 'Failed to add liability', description: error?.message, variant: 'destructive' });
      return;
    }

    const { error: itemsError } = await supabase.from('company_liability_items').insert(
      valid.map(li => ({
        liability_id: inserted.id,
        item_name: li.item_name.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        line_total: lineTotal(li),
      }))
    );
    setSaving(false);

    if (itemsError) {
      toast({ title: 'Liability saved but items failed', description: itemsError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Liability added' });
    }
    setAddOpen(false);
    resetForm();
    fetchItems();
    window.dispatchEvent(new CustomEvent('liabilities-updated'));
  };

  const handlePay = async () => {
    if (!payTarget) return;
    const pay = parseFloat(payAmount);
    if (!pay || pay <= 0) {
      toast({ title: 'Enter a valid payment amount', variant: 'destructive' });
      return;
    }
    const newPaid = Math.min(payTarget.amount, (payTarget.paid_amount || 0) + pay);
    setSaving(true);
    const { error } = await supabase
      .from('company_liabilities')
      .update({ paid_amount: newPaid, status: statusOf(payTarget.amount, newPaid) })
      .eq('id', payTarget.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to record payment', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Payment recorded' });
    setPayTarget(null);
    setPayAmount('');
    fetchItems();
    window.dispatchEvent(new CustomEvent('liabilities-updated'));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('company_liabilities').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Liability deleted' });
    setDeleteTarget(null);
    fetchItems();
    window.dispatchEvent(new CustomEvent('liabilities-updated'));
  };

  return (
    <Card className="w-full min-w-0 overflow-x-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Company Liabilities &amp; Payables
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={items.length === 0}
            onClick={() => generateLiabilitiesReportPDF(items)}>
            <FileDown className="h-4 w-4 mr-1" /> Download Report
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Liability
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Liabilities</p>
            <p className="text-lg font-bold">${fmt(items.reduce((s, i) => s + (i.amount || 0), 0))}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-lg font-bold text-green-600">${fmt(totalPaid)}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Outstanding Payables</p>
            <p className="text-lg font-bold text-red-600">${fmt(totalOutstanding)}</p>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No liabilities recorded</TableCell></TableRow>
              ) : items.map(item => {
                const remaining = Math.max(0, (item.amount || 0) - (item.paid_amount || 0));
                const status = statusOf(item.amount, item.paid_amount);
                return (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setViewTarget(item)}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.vendor_name || '—'}</TableCell>
                    <TableCell className="text-right">{item.items?.length || 0}</TableCell>
                    <TableCell className="text-right">${fmt(item.amount || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">${fmt(item.paid_amount || 0)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">${fmt(remaining)}</TableCell>
                    <TableCell>{item.due_date || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)} className="text-xs capitalize">
                        {status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="mr-1" onClick={() => setViewTarget(item)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1"
                        disabled={remaining <= 0}
                        onClick={() => { setPayTarget(item); setPayAmount(String(remaining)); }}
                      >
                        <Banknote className="h-3.5 w-3.5 mr-1" /> Record Payment
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Liability / Debt</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Title</Label>
                <Input placeholder="e.g. Raw Material Paper Ink" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Vendor Name</Label>
                <Input placeholder="Supplier name" value={form.vendor_name}
                  onChange={e => setForm({ ...form, vendor_name: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="space-y-2">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-5">
                      <Input placeholder="Item name" value={li.item_name}
                        onChange={e => updateLine(idx, { item_name: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input type="number" min="0" step="any" placeholder="Qty" value={li.quantity}
                        onChange={e => updateLine(idx, { quantity: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Input type="number" min="0" step="0.01" placeholder="Price" value={li.unit_price}
                        onChange={e => updateLine(idx, { unit_price: e.target.value })} />
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right text-sm font-medium pb-2">
                      ${fmt(lineTotal(li))}
                    </div>
                    <div className="col-span-1 pb-1">
                      <Button size="icon" variant="ghost" disabled={lineItems.length === 1}
                        onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setLineItems(prev => [...prev, emptyItem()])}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-lg font-bold">${fmt(formTotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View details dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewTarget?.title}</DialogTitle></DialogHeader>
          {viewTarget && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p className="text-muted-foreground">Vendor</p>
                <p className="text-right">{viewTarget.vendor_name || '—'}</p>
                <p className="text-muted-foreground">Due Date</p>
                <p className="text-right">{viewTarget.due_date || '—'}</p>
                <p className="text-muted-foreground">Paid</p>
                <p className="text-right text-green-600">${fmt(viewTarget.paid_amount || 0)}</p>
                <p className="text-muted-foreground">Remaining</p>
                <p className="text-right font-semibold text-red-600">
                  ${fmt(Math.max(0, (viewTarget.amount || 0) - (viewTarget.paid_amount || 0)))}
                </p>
              </div>

              {(viewTarget.items?.length || 0) > 0 ? (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewTarget.items!.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell>{it.item_name}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right">${fmt(it.unit_price)}</TableCell>
                          <TableCell className="text-right font-medium">${fmt(it.line_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No itemized breakdown recorded.</p>
              )}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">Total Amount</span>
                <span className="text-lg font-bold">${fmt(viewTarget.amount || 0)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
            <Button onClick={() => viewTarget && generateLiabilityPDF(viewTarget)}>
              <FileDown className="h-4 w-4 mr-1" /> Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {payTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {payTarget.title} — remaining ${fmt(Math.max(0, payTarget.amount - payTarget.paid_amount))}
              </p>
              <div>
                <Label>Payment Amount ($)</Label>
                <Input type="number" min="0" step="0.01" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={handlePay} disabled={saving}>Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this liability?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} will be permanently removed from company payables.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
