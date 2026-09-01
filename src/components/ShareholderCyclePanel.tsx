import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarClock, Plus, FileText, Check, X, Lock, RefreshCw } from 'lucide-react';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';

const RESERVE_PERCENTAGE = 0.30;
const CLOSING_MONTH = 11; // December (0-indexed)
const CLOSING_DAY = 20;

interface FiscalYear {
  id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  status: string;
  closing_net_worth: number | null;
  reserve_amount: number | null;
  distributed_amount: number | null;
  closing_notes: string | null;
  closed_at: string | null;
}

interface ChangeRequest {
  id: string;
  fiscal_year_id: string | null;
  shareholder_id: string;
  change_type: string;
  amount: number;
  effective_date: string;
  document_path: string | null;
  document_name: string | null;
  status: string;
  notes: string | null;
  previous_percentage: number | null;
  new_percentage: number | null;
}

interface Shareholder {
  id: string;
  full_name: string;
  share_percentage: number;
  status: string;
}

// The company year runs 21 December -> 20 December
function cycleForDate(d: Date) {
  const y = d.getFullYear();
  const closingThisYear = new Date(y, CLOSING_MONTH, CLOSING_DAY);
  const endYear = d <= closingThisYear ? y : y + 1;
  const start = new Date(endYear - 1, CLOSING_MONTH, CLOSING_DAY + 1);
  const end = new Date(endYear, CLOSING_MONTH, CLOSING_DAY);
  return {
    label: `FY ${endYear}`,
    start_date: format(start, 'yyyy-MM-dd'),
    end_date: format(end, 'yyyy-MM-dd'),
  };
}

export function ShareholderCyclePanel() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Request form
  const [reqOpen, setReqOpen] = useState(false);
  const [reqShareholder, setReqShareholder] = useState('');
  const [reqType, setReqType] = useState('capital_increase');
  const [reqAmount, setReqAmount] = useState('');
  const [reqDate, setReqDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reqNotes, setReqNotes] = useState('');
  const [reqFile, setReqFile] = useState<File | null>(null);

  // Close year
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');

  const openYear = years.find(y => y.status === 'open') || null;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [fyRes, reqRes, shRes] = await Promise.all([
      supabase.from('fiscal_years').select('*').order('end_date', { ascending: false }),
      supabase.from('share_change_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('shareholders').select('id, full_name, share_percentage, status').order('full_name'),
    ]);
    if (fyRes.data) setYears(fyRes.data as FiscalYear[]);
    if (reqRes.data) setRequests(reqRes.data as ChangeRequest[]);
    if (shRes.data) setShareholders(shRes.data as Shareholder[]);
    setLoading(false);
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shName = (id: string) => shareholders.find(s => s.id === id)?.full_name || '—';

  const startCycle = async () => {
    const c = cycleForDate(new Date());
    if (years.some(y => y.year_label === c.label)) {
      toast({ title: 'Cycle exists', description: `${c.label} is already recorded.`, variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('fiscal_years').insert({
      year_label: c.label,
      start_date: c.start_date,
      end_date: c.end_date,
      status: 'open',
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Cycle started', description: `${c.label} runs ${c.start_date} → ${c.end_date}` });
    fetchData();
  };

  // Net paid-in capital per shareholder from the ledger
  const computeCapitalBase = async () => {
    const { data } = await supabase
      .from('shareholder_transactions')
      .select('shareholder_id, transaction_type, amount');
    const map = new Map<string, number>();
    (data || []).forEach((t: any) => {
      const cur = map.get(t.shareholder_id) || 0;
      if (t.transaction_type === 'capital_investment') map.set(t.shareholder_id, cur + Number(t.amount));
      else if (t.transaction_type === 'withdrawal') map.set(t.shareholder_id, cur - Number(t.amount));
    });
    return map;
  };

  // International pro-rata rule: ownership % = own paid-in capital / total paid-in capital
  const recalcPercentages = async () => {
    const capital = await computeCapitalBase();
    const active = shareholders.filter(s => s.status === 'active');
    const total = active.reduce((sum, s) => sum + Math.max(0, capital.get(s.id) || 0), 0);
    if (total <= 0) return null;
    const results: { id: string; pct: number }[] = active.map(s => ({
      id: s.id,
      pct: Math.round(((Math.max(0, capital.get(s.id) || 0) / total) * 100) * 1000) / 1000,
    }));
    await Promise.all(results.map(r =>
      supabase.from('shareholders').update({ share_percentage: r.pct }).eq('id', r.id)
    ));
    return results;
  };

  const submitRequest = async () => {
    if (!reqShareholder || !reqAmount || Number(reqAmount) <= 0) {
      toast({ title: 'Missing data', description: 'Choose a shareholder and enter an amount.', variant: 'destructive' });
      return;
    }
    if (!reqFile) {
      toast({ title: 'Signed paper required', description: 'Attach the signed share agreement document.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    let path: string | null = null;
    const ext = reqFile.name.split('.').pop();
    path = `${reqShareholder}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from('shareholder-documents').upload(path, reqFile, { upsert: false });
    if (up.error) {
      setBusy(false);
      toast({ title: 'Upload failed', description: up.error.message, variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('share_change_requests').insert({
      fiscal_year_id: openYear?.id ?? null,
      shareholder_id: reqShareholder,
      change_type: reqType,
      amount: Number(reqAmount),
      effective_date: reqDate,
      document_path: path,
      document_name: reqFile.name,
      notes: reqNotes || null,
      previous_percentage: shareholders.find(s => s.id === reqShareholder)?.share_percentage ?? null,
      created_by: user?.id ?? null,
      status: 'pending',
    });
    setBusy(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Request recorded', description: 'Pending admin approval.' });
    setReqOpen(false);
    setReqShareholder(''); setReqAmount(''); setReqNotes(''); setReqFile(null); setReqType('capital_increase');
    fetchData();
  };

  const approveRequest = async (r: ChangeRequest) => {
    setBusy(true);
    // 1. Post the ledger transaction
    const txType = r.change_type === 'capital_increase' ? 'capital_investment' : 'withdrawal';
    const txRes = await supabase.from('shareholder_transactions').insert({
      shareholder_id: r.shareholder_id,
      transaction_type: txType as any,
      amount: r.amount,
      transaction_date: r.effective_date,
      description: `${r.change_type === 'capital_increase' ? 'Share increase' : 'Share reduction'} approved (signed agreement: ${r.document_name || 'attached'})`,
      created_by: user?.id ?? null,
    });
    if (txRes.error) {
      setBusy(false);
      toast({ title: 'Error', description: txRes.error.message, variant: 'destructive' });
      return;
    }
    // 2. Recalculate every shareholder's ownership pro-rata
    const results = await recalcPercentages();
    const newPct = results?.find(x => x.id === r.shareholder_id)?.pct ?? null;
    await supabase.from('share_change_requests').update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      new_percentage: newPct,
    }).eq('id', r.id);
    setBusy(false);
    toast({ title: 'Approved', description: 'Ledger posted and ownership percentages recalculated.' });
    fetchData();
    window.dispatchEvent(new Event('liabilities-updated'));
  };

  const rejectRequest = async (r: ChangeRequest) => {
    await supabase.from('share_change_requests').update({ status: 'rejected', approved_by: user?.id ?? null, approved_at: new Date().toISOString() }).eq('id', r.id);
    toast({ title: 'Rejected' });
    fetchData();
  };

  const viewDocument = async (r: ChangeRequest) => {
    if (!r.document_path) return;
    const { data, error } = await supabase.storage.from('shareholder-documents').createSignedUrl(r.document_path, 300);
    if (error || !data) { toast({ title: 'Error', description: error?.message || 'Cannot open file', variant: 'destructive' }); return; }
    window.open(data.signedUrl, '_blank');
  };

  const closeYear = async () => {
    if (!openYear) return;
    setBusy(true);
    const [invoicesRes, paymentsRes, expensesRes, balancesRes, assetsRes, billsRes, liabilitiesRes] = await Promise.all([
      supabase.from('invoices').select('total_amount, amount_paid').eq('is_draft', false),
      supabase.from('payments').select('amount'),
      supabase.from('expenses').select('amount').eq('approval_status', 'approved'),
      supabase.from('beginning_balances').select('amount'),
      supabase.from('company_assets').select('total_value'),
      supabase.from('vendor_bills').select('total_amount, amount_paid'),
      supabase.from('company_liabilities').select('amount, paid_amount'),
    ]);
    const opening = (balancesRes.data || []).reduce((s: number, b: any) => s + (b.amount || 0), 0);
    const collected = (paymentsRes.data || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const expenses = (expensesRes.data || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const cash = opening + collected - expenses;
    const receivables = (invoicesRes.data || []).reduce((s: number, i: any) => s + Math.max(0, (i.total_amount || 0) - (i.amount_paid || 0)), 0);
    const fixedAssets = (assetsRes.data || []).reduce((s: number, a: any) => s + (a.total_value || 0), 0);
    const billsDue = (billsRes.data || []).reduce((s: number, b: any) => s + Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0)), 0);
    const payablesDue = (liabilitiesRes.data || []).reduce((s: number, l: any) => s + Math.max(0, (l.amount || 0) - (l.paid_amount || 0)), 0);
    const liabilities = billsDue + payablesDue;

    const netWorth = cash + receivables + fixedAssets - liabilities;
    const cashAfterPayables = Math.max(0, cash - liabilities);
    const reserve = cashAfterPayables * RESERVE_PERCENTAGE;
    const distributable = cashAfterPayables - reserve;

    // Reserve is capitalised into company assets (retained reserve)
    let reserveAssetId: string | null = null;
    if (reserve > 0) {
      const assetRes = await supabase.from('company_assets').insert({
        asset_name: `Retained Company Reserve — ${openYear.year_label}`,
        quantity: 1,
        unit_price: Math.round(reserve * 100) / 100,
        status: 'working',
        notes: `Automatically capitalised at the closing of ${openYear.year_label} on 20 December (${RESERVE_PERCENTAGE * 100}% reserve).`,
        created_by: user?.id ?? null,
      }).select('id').single();
      if (assetRes.data) reserveAssetId = assetRes.data.id;
    }

    await supabase.from('fiscal_years').update({
      status: 'closed',
      closing_net_worth: Math.round(netWorth * 100) / 100,
      reserve_amount: Math.round(reserve * 100) / 100,
      distributed_amount: Math.round(distributable * 100) / 100,
      closing_notes: closeNotes || null,
      reserve_asset_id: reserveAssetId,
      closed_at: new Date().toISOString(),
      closed_by: user?.id ?? null,
    }).eq('id', openYear.id);

    // Open the next 21 Dec -> 20 Dec cycle
    const nextEnd = parseISO(openYear.end_date);
    const next = cycleForDate(new Date(nextEnd.getFullYear() + 1, CLOSING_MONTH, CLOSING_DAY));
    if (!years.some(y => y.year_label === next.label)) {
      await supabase.from('fiscal_years').insert({
        year_label: next.label,
        start_date: next.start_date,
        end_date: next.end_date,
        status: 'open',
        created_by: user?.id ?? null,
      });
    }

    setBusy(false);
    setCloseOpen(false);
    setCloseNotes('');
    toast({ title: 'Year closed', description: `${openYear.year_label} closed. Reserve $${fmt(reserve)} moved to company assets.` });
    fetchData();
    window.dispatchEvent(new Event('liabilities-updated'));
  };

  const daysLeft = openYear ? differenceInCalendarDays(parseISO(openYear.end_date), new Date()) : null;
  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');

  if (loading) return null;

  return (
    <div className="space-y-4 min-w-0">
      {/* Current cycle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Shareholder Year Cycle
              </CardTitle>
              <CardDescription>Each company year closes on 20 December and the new year starts on 21 December.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
              {!openYear && <Button size="sm" onClick={startCycle} disabled={busy}><Plus className="h-4 w-4 mr-1" />Start Year Cycle</Button>}
              {openYear && <Button size="sm" variant="destructive" onClick={() => setCloseOpen(true)} disabled={busy}><Lock className="h-4 w-4 mr-1" />Close {openYear.year_label}</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {openYear ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Open cycle</p>
                <p className="font-bold">{openYear.year_label}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="font-medium text-sm">{format(parseISO(openYear.start_date), 'dd MMM yyyy')} → {format(parseISO(openYear.end_date), 'dd MMM yyyy')}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Days to closing</p>
                <p className={`font-bold ${daysLeft !== null && daysLeft <= 30 ? 'text-red-600' : ''}`}>{daysLeft} days</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open cycle. Start the year cycle to begin tracking share changes and closing distribution.</p>
          )}

          {years.filter(y => y.status === 'closed').length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Closed Year</TableHead>
                    <TableHead>Closed On</TableHead>
                    <TableHead className="text-right">Net Worth</TableHead>
                    <TableHead className="text-right">Reserve → Assets</TableHead>
                    <TableHead className="text-right">Distributed Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {years.filter(y => y.status === 'closed').map(y => (
                    <TableRow key={y.id}>
                      <TableCell className="font-medium">{y.year_label}</TableCell>
                      <TableCell>{y.closed_at ? format(new Date(y.closed_at), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">${fmt(y.closing_net_worth || 0)}</TableCell>
                      <TableCell className="text-right">${fmt(y.reserve_amount || 0)}</TableCell>
                      <TableCell className="text-right">${fmt(y.distributed_amount || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share change requests */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Share Increase / Reduction Requests</CardTitle>
              <CardDescription>Ownership is recalculated pro-rata from paid-in capital. A signed agreement must be attached.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setReqOpen(true)}><Plus className="h-4 w-4 mr-1" />New Request</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shareholder</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Old %</TableHead>
                <TableHead>New %</TableHead>
                <TableHead>Paper</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...pending, ...history].length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-sm text-muted-foreground">No share change requests yet.</TableCell></TableRow>
              ) : [...pending, ...history].map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{shName(r.shareholder_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.change_type === 'capital_increase' ? 'text-green-700' : 'text-orange-700'}>
                      {r.change_type === 'capital_increase' ? 'Increase Share' : 'Take Out Share'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">${fmt(r.amount)}</TableCell>
                  <TableCell>{format(parseISO(r.effective_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>{r.previous_percentage != null ? `${r.previous_percentage}%` : '—'}</TableCell>
                  <TableCell>{r.new_percentage != null ? `${r.new_percentage}%` : '—'}</TableCell>
                  <TableCell>
                    {r.document_path ? (
                      <Button variant="ghost" size="sm" onClick={() => viewDocument(r)}><FileText className="h-4 w-4" /></Button>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'pending' && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => approveRequest(r)} disabled={busy}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => rejectRequest(r)} disabled={busy}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New request dialog */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Share Change Request</DialogTitle>
            <DialogDescription>Record a shareholder adding capital or taking part of their share out. The signed paper is mandatory.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Shareholder</Label>
              <Select value={reqShareholder} onValueChange={setReqShareholder}>
                <SelectTrigger><SelectValue placeholder="Select shareholder" /></SelectTrigger>
                <SelectContent>
                  {shareholders.filter(s => s.status === 'active').map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.share_percentage}%)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={reqType} onValueChange={setReqType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="capital_increase">Add money — increase share</SelectItem>
                  <SelectItem value="share_reduction">Take out money — reduce share</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" value={reqAmount} onChange={e => setReqAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-1.5">
              <Label>Effective date</Label>
              <Input type="date" value={reqDate} onChange={e => setReqDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Signed agreement (PDF / image)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={e => setReqFile(e.target.files?.[0] || null)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={reqNotes} onChange={e => setReqNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={busy}>Save Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close year dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Close {openYear?.year_label}</DialogTitle>
            <DialogDescription>
              This locks the year, records the closing net worth and distribution, capitalises the {RESERVE_PERCENTAGE * 100}% company reserve into Company Assets, and opens the next 21 December – 20 December cycle. No invoices, payments or expenses are changed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Closing notes (optional)</Label>
            <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={closeYear} disabled={busy}>Close Year</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
