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
import { Landmark, Plus, Trash2, Banknote } from 'lucide-react';
import { defaultDueDate } from '@/utils/dueDate';

interface Liability {
  id: string;
  title: string;
  vendor_name: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
}

const statusOf = (amount: number, paid: number) =>
  paid <= 0 ? 'unpaid' : paid >= amount ? 'paid' : 'partially_paid';

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
  status === 'paid' ? 'default' : status === 'partially_paid' ? 'secondary' : 'destructive';

export function CompanyLiabilitiesPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Liability | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Liability | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', vendor_name: '', amount: '', due_date: defaultDueDate() });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('company_liabilities')
      .select('id, title, vendor_name, amount, paid_amount, due_date, status')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Could not load liabilities', description: error.message, variant: 'destructive' });
    setItems((data || []) as Liability[]);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const totalOutstanding = items.reduce((s, i) => s + Math.max(0, (i.amount || 0) - (i.paid_amount || 0)), 0);
  const totalPaid = items.reduce((s, i) => s + (i.paid_amount || 0), 0);

  const handleAdd = async () => {
    const amount = parseFloat(form.amount);
    if (!form.title.trim() || !amount || amount <= 0) {
      toast({ title: 'Title and a valid amount are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from('company_liabilities').insert({
      title: form.title.trim(),
      vendor_name: form.vendor_name.trim() || null,
      amount,
      paid_amount: 0,
      due_date: form.due_date || null,
      status: 'unpaid',
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to add liability', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Liability added' });
    setAddOpen(false);
    setForm({ title: '', vendor_name: '', amount: '', due_date: defaultDueDate() });
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
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Company Liabilities &amp; Payables
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Liability
        </Button>
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
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No liabilities recorded</TableCell></TableRow>
              ) : items.map(item => {
                const remaining = Math.max(0, (item.amount || 0) - (item.paid_amount || 0));
                const status = statusOf(item.amount, item.paid_amount);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.vendor_name || '—'}</TableCell>
                    <TableCell className="text-right">${fmt(item.amount || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">${fmt(item.paid_amount || 0)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">${fmt(remaining)}</TableCell>
                    <TableCell>{item.due_date || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)} className="text-xs capitalize">
                        {status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
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
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add New Liability / Debt</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
              <Label>Total Amount ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>Save</Button>
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
