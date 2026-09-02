import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2, ShieldCheck, FileSignature, Coins, ClipboardList, ScrollText, Plus, Send,
  Check, X, RotateCcw, Play, Upload, RefreshCw, Users2, PieChart, AlertTriangle, Trash2,
} from 'lucide-react';

const BUCKET = 'shareholder-documents';

type Role = 'admin' | 'board' | 'accountant' | 'auditor' | string;

const REQUEST_TYPES: { value: string; label: string; prefix: string }[] = [
  { value: 'share_issuance', label: 'Issue New Shares', prefix: 'SHR' },
  { value: 'capital_increase', label: 'Increase Share Capital', prefix: 'SHR' },
  { value: 'capital_decrease', label: 'Decrease Share Capital', prefix: 'SHR' },
  { value: 'new_shareholder', label: 'Add New Shareholder', prefix: 'SHH' },
  { value: 'remove_shareholder', label: 'Remove Shareholder', prefix: 'SHH' },
  { value: 'share_transfer', label: 'Share Transfer', prefix: 'TRF' },
  { value: 'dividend', label: 'Dividend Declaration', prefix: 'DIV' },
  { value: 'structure_change', label: 'Major Structure Change', prefix: 'CRP' },
  { value: 'officer_change', label: 'Appoint / Remove Officer', prefix: 'CRP' },
  { value: 'closure', label: 'Company Closure / Liquidation', prefix: 'LIQ' },
];

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-warning/15 text-warning border-warning/30',
  changes_requested: 'bg-warning/15 text-warning border-warning/30',
  approved: 'bg-success/15 text-success border-success/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  executed: 'bg-primary/15 text-primary border-primary/30',
  cancelled: 'bg-muted text-muted-foreground',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
  cancelled: 'Cancelled',
};

const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: any) => Number(n) || 0;

interface Allocation { shareholder_id: string; new_name?: string; shares: string; amount: string }

export default function CorporateAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [shareholders, setShareholders] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [shareTx, setShareTx] = useState<any[]>([]);
  const [dividends, setDividends] = useState<any[]>([]);
  const [entitlements, setEntitlements] = useState<any[]>([]);
  const [compliance, setCompliance] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const isAdmin = roles.includes('admin');
  const isBoard = roles.includes('board');
  const isAuditor = roles.includes('auditor');
  const isAccountant = roles.includes('accountant');
  const canView = isAdmin || isBoard || isAuditor || isAccountant;
  const [equity, setEquity] = useState<{ loanTx: any[]; cash: number; receivables: number; fixedAssets: number; liabilities: number }>({
    loanTx: [], cash: 0, receivables: 0, fixedAssets: 0, liabilities: 0,
  });


  // ---- data ----
  const fetchAll = async () => {
    const [s, sh, rq, dc, tx, dv, en, cp, al, pf] = await Promise.all([
      supabase.from('corporate_settings').select('*').limit(1).maybeSingle(),
      supabase.from('shareholders').select('*').order('full_name'),
      supabase.from('corporate_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('corporate_request_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('share_transactions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('dividend_declarations').select('*').order('created_at', { ascending: false }),
      supabase.from('dividend_entitlements').select('*'),
      supabase.from('compliance_items').select('*').order('due_date'),
      supabase.from('corporate_audit_log').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('profiles').select('id, full_name'),
    ]);
    setSettings(s.data);
    setShareholders(sh.data || []);
    setRequests(rq.data || []);
    setDocs(dc.data || []);
    setShareTx(tx.data || []);
    setDividends(dv.data || []);
    setEntitlements(en.data || []);
    setCompliance(cp.data || []);
    setAudit(al.data || []);
    setProfiles(Object.fromEntries((pf.data || []).map((p: any) => [p.id, p.full_name])));
    setLoading(false);

    // live equity position (same basis as the Shareholders Overview)
    const [shTx, invRes, payRes, expRes, balRes, assetRes, billRes, liabRes] = await Promise.all([
      supabase.from('shareholder_transactions').select('shareholder_id, transaction_type, amount'),
      supabase.from('invoices').select('total_amount, amount_paid, is_draft').eq('is_draft', false),
      supabase.from('payments').select('amount'),
      supabase.from('expenses').select('amount, approval_status').eq('approval_status', 'approved'),
      supabase.from('beginning_balances').select('amount'),
      supabase.from('company_assets').select('total_value'),
      supabase.from('vendor_bills').select('total_amount, amount_paid'),
      supabase.from('company_liabilities').select('amount, paid_amount'),
    ]);
    const sum = (rows: any[] | null, f: (r: any) => number) => (rows || []).reduce((a, r) => a + f(r), 0);
    setEquity({
      loanTx: (shTx.data || []) as any[],
      cash: sum(balRes.data, (b) => num(b.amount)) + sum(payRes.data, (p) => num(p.amount)) - sum(expRes.data, (e) => num(e.amount)),
      receivables: sum(invRes.data, (i) => Math.max(0, num(i.total_amount) - num(i.amount_paid))),
      fixedAssets: sum(assetRes.data, (a) => num(a.total_value)),
      liabilities:
        sum(billRes.data, (b) => Math.max(0, num(b.total_amount) - num(b.amount_paid))) +
        sum(liabRes.data, (l) => Math.max(0, num(l.amount) - num(l.paid_amount))),
    });
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      setRoles((data || []).map((r: any) => r.role));
      await fetchAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- derived share register figures ----
  const totalPaidUp = useMemo(() => shareholders.reduce((s, h) => s + num(h.paid_up_amount), 0), [shareholders]);
  const authorized = num(settings?.authorized_shares);
  const parValue = num(settings?.par_value) || 1;

  // outstanding shareholder loan (debt_taken - debt_repayment)
  const loanOf = (id: string) =>
    Math.max(
      0,
      equity.loanTx
        .filter((t: any) => t.shareholder_id === id)
        .reduce((s: number, t: any) => s + (t.transaction_type === 'debt_taken' ? num(t.amount) : t.transaction_type === 'debt_repayment' ? -num(t.amount) : 0), 0),
    );
  const activeShareholders = shareholders.filter((h) => h.status === 'active');
  const totalLoans = activeShareholders.reduce((s, h) => s + loanOf(h.id), 0);
  const netCompanyWorth = equity.cash + equity.receivables + equity.fixedAssets + totalLoans - equity.liabilities;

  // Issued shares are backed by the company's equity: net worth ÷ par value
  const recordedIssued = shareholders.reduce((s, h) => s + num(h.shares_owned), 0);
  const equityIssued = parValue > 0 ? netCompanyWorth / parValue : 0;
  const totalIssued = recordedIssued > 0 ? recordedIssued : Math.max(0, equityIssued);
  const shareCapital = totalIssued * parValue;
  const unissued = Math.max(0, authorized - totalIssued);
  const pct = (h: any) =>
    recordedIssued > 0 ? (num(h.shares_owned) / recordedIssued) * 100 : num(h.share_percentage);
  const sharesOf = (h: any) => (recordedIssued > 0 ? num(h.shares_owned) : (totalIssued * num(h.share_percentage)) / 100);
  const shareNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // cash distribution (30% company reserve), then loan settlement per shareholder
  const cashAfterPayables = Math.max(0, equity.cash - equity.liabilities);
  const distributableCash = cashAfterPayables * 0.7;


  const logAudit = async (entry: any) => {
    await supabase.from('corporate_audit_log').insert({
      actor_id: user?.id,
      actor_role: roles[0] || null,
      ...entry,
    });
  };

  // ---------------- request dialog ----------------
  const emptyForm = {
    request_type: 'share_issuance',
    title: '',
    description: '',
    reason: '',
    additional_shares: '',
    nominal_value: '',
    transferor_id: '',
    transferee_id: '',
    transfer_shares: '',
    transfer_price: '',
    transfer_date: new Date().toISOString().slice(0, 10),
    profit_available: '',
    dividend_amount: '',
    declaration_date: new Date().toISOString().slice(0, 10),
    payment_date: '',
    new_name: '',
    new_email: '',
    new_phone: '',
  };
  const [form, setForm] = useState<any>(emptyForm);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [decisionComment, setDecisionComment] = useState('');

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const uploadDocs = async (requestId: string) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      const path = `corporate/${requestId}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false });
      if (error) { toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }); continue; }
      await supabase.from('corporate_request_documents').insert({
        request_id: requestId, file_name: f.name, file_path: path, uploaded_by: user?.id,
      });
    }
  };

  const createRequest = async (submit: boolean) => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const prefix = REQUEST_TYPES.find((t) => t.value === form.request_type)?.prefix || 'CRP';
      const { data: ref, error: refErr } = await supabase.rpc('generate_corporate_reference', { _prefix: prefix });
      if (refErr) throw refErr;
      const details: any = { ...form };
      details.allocations = allocations
        .filter((a) => (a.shareholder_id || a.new_name) && num(a.shares) > 0)
        .map((a) => ({ ...a, shares: num(a.shares), amount: num(a.amount) }));
      const { data, error } = await supabase.from('corporate_requests').insert({
        reference_no: ref as string,
        request_type: form.request_type,
        title: form.title,
        description: form.description || null,
        reason: form.reason || null,
        details,
        status: submit ? 'pending_approval' : 'draft',
        prepared_by: user?.id,
        submitted_at: submit ? new Date().toISOString() : null,
      }).select().single();
      if (error) throw error;
      await uploadDocs(data.id);
      toast({ title: submit ? 'Submitted to the Board' : 'Draft saved', description: data.reference_no });
      setOpenNew(false); setForm(emptyForm); setAllocations([]); setFiles(null);
      fetchAll();
    } catch (e: any) {
      toast({ title: 'Could not save request', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const submitRequest = async (r: any) => {
    await supabase.from('corporate_requests').update({ status: 'pending_approval', submitted_at: new Date().toISOString() }).eq('id', r.id);
    toast({ title: 'Sent to the Board for approval' });
    fetchAll();
  };

  const decide = async (r: any, status: 'approved' | 'rejected' | 'changes_requested') => {
    if (status !== 'approved' && !decisionComment.trim()) {
      toast({ title: 'A reason is required', variant: 'destructive' }); return;
    }
    if (r.prepared_by === user?.id) {
      toast({ title: 'You cannot approve your own request', variant: 'destructive' }); return;
    }
    await supabase.from('corporate_requests').update({
      status, decided_by: user?.id, decided_at: new Date().toISOString(), decision_comment: decisionComment || null,
    }).eq('id', r.id);
    setDecisionComment(''); setDetail(null);
    toast({ title: `Request ${STATUS_LABEL[status]}` });
    fetchAll();
  };

  const recalcPercentages = async (list: any[]) => {
    const total = list.reduce((s, h) => s + num(h.shares_owned), 0);
    for (const h of list) {
      const p = total > 0 ? Number(((num(h.shares_owned) / total) * 100).toFixed(4)) : 0;
      await supabase.from('shareholders').update({ share_percentage: p }).eq('id', h.id);
    }
  };

  const execute = async (r: any) => {
    setBusy(true);
    try {
      const d = r.details || {};
      const current = [...shareholders];
      const byId = (id: string) => current.find((h) => h.id === id);
      const txRows: any[] = [];
      const parV = num(d.nominal_value) || parValue;

      const applyDelta = async (holder: any, delta: number, amount: number, type: string, extra: any = {}) => {
        const before = num(holder.shares_owned);
        const after = before + delta;
        await supabase.from('shareholders').update({
          shares_owned: after,
          paid_up_amount: num(holder.paid_up_amount) + amount,
          par_value: parV,
          date_acquired: holder.date_acquired || new Date().toISOString().slice(0, 10),
        }).eq('id', holder.id);
        holder.shares_owned = after;
        holder.paid_up_amount = num(holder.paid_up_amount) + amount;
        txRows.push({
          request_id: r.id, shareholder_id: holder.id, transaction_type: type,
          shares_delta: delta, amount, shares_before: before, shares_after: after,
          price_per_share: parV, created_by: user?.id, notes: r.title, ...extra,
        });
      };

      if (['share_issuance', 'capital_increase', 'capital_decrease'].includes(r.request_type)) {
        const sign = r.request_type === 'capital_decrease' ? -1 : 1;
        if (sign > 0 && authorized > 0) {
          const requested = (d.allocations || []).reduce((s: number, a: any) => s + num(a.shares), 0);
          if (totalIssued + requested > authorized) {
            throw new Error(`Issuing ${requested.toLocaleString()} shares would exceed authorized shares (${authorized.toLocaleString()}). Only ${unissued.toLocaleString()} are unissued.`);
          }
        }

        for (const a of d.allocations || []) {
          let holder = byId(a.shareholder_id);
          if (!holder && a.new_name) {
            const { data: created } = await supabase.from('shareholders').insert({
              full_name: a.new_name, status: 'active', shares_owned: 0, par_value: parV, created_by: user?.id,
            }).select().single();
            if (created) { current.push(created); holder = created; }
          }
          if (!holder) continue;
          await applyDelta(holder, sign * num(a.shares), sign * num(a.amount), r.request_type);
        }
      } else if (r.request_type === 'new_shareholder') {
        const { data: created } = await supabase.from('shareholders').insert({
          full_name: d.new_name, email: d.new_email || null, phone: d.new_phone || null,
          status: 'active', shares_owned: 0, par_value: parV, created_by: user?.id,
          date_acquired: new Date().toISOString().slice(0, 10),
        }).select().single();
        if (created) {
          current.push(created);
          const alloc = (d.allocations || [])[0];
          await applyDelta(created, num(alloc?.shares), num(alloc?.amount), 'new_shareholder');
        }
      } else if (r.request_type === 'remove_shareholder') {
        const holder = byId(d.transferor_id);
        if (holder) {
          await applyDelta(holder, -num(holder.shares_owned), 0, 'remove_shareholder');
          await supabase.from('shareholders').update({ status: 'inactive' }).eq('id', holder.id);
          holder.status = 'inactive';
        }
      } else if (r.request_type === 'share_transfer') {
        const from = byId(d.transferor_id); const to = byId(d.transferee_id);
        const qty = num(d.transfer_shares);
        if (!from || !to) throw new Error('Transferor or transferee missing');
        if (num(from.shares_owned) < qty) throw new Error('Transferor does not hold enough shares');
        await applyDelta(from, -qty, 0, 'transfer_out', { counterparty_id: to.id, price_per_share: num(d.transfer_price) || parV });
        await applyDelta(to, qty, 0, 'transfer_in', { counterparty_id: from.id, price_per_share: num(d.transfer_price) || parV });
      } else if (r.request_type === 'dividend') {
        const totalShares = current.reduce((s, h) => s + num(h.shares_owned), 0);
        const amount = num(d.dividend_amount);
        const perShare = totalShares > 0 ? amount / totalShares : 0;
        const { data: decl } = await supabase.from('dividend_declarations').insert({
          request_id: r.id, reference_no: r.reference_no, profit_available: num(d.profit_available),
          dividend_amount: amount, dividend_per_share: perShare,
          declaration_date: d.declaration_date || new Date().toISOString().slice(0, 10),
          payment_date: d.payment_date || null, status: 'approved', notes: r.description, created_by: user?.id,
        }).select().single();
        if (decl) {
          const rows = current.filter((h) => num(h.shares_owned) > 0).map((h) => ({
            declaration_id: decl.id, shareholder_id: h.id, shares: num(h.shares_owned),
            amount: Number((num(h.shares_owned) * perShare).toFixed(2)),
          }));
          if (rows.length) await supabase.from('dividend_entitlements').insert(rows);
        }
      }

      if (txRows.length) await supabase.from('share_transactions').insert(txRows);
      await recalcPercentages(current);
      await supabase.from('corporate_requests').update({
        status: 'executed', executed_by: user?.id, executed_at: new Date().toISOString(),
      }).eq('id', r.id);
      await logAudit({
        entity_type: 'share_register', entity_id: r.id, reference_no: r.reference_no,
        action: 'share_register_updated', approval_status: 'executed',
        comments: `Register updated after Board approval of ${r.reference_no}`,
      });
      toast({ title: 'Executed', description: 'Share register updated and recorded.' });
      setDetail(null);
      fetchAll();
    } catch (e: any) {
      toast({ title: 'Execution failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openDoc = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const markDividendPaid = async (e: any) => {
    await supabase.from('dividend_entitlements').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('id', e.id);
    fetchAll();
  };

  // ---- compliance ----
  const [compForm, setCompForm] = useState({ title: '', category: 'filing', authority: '', due_date: '', notes: '' });
  const addCompliance = async () => {
    if (!compForm.title || !compForm.due_date) { toast({ title: 'Title and due date required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('compliance_items').insert({ ...compForm, created_by: user?.id });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setCompForm({ title: '', category: 'filing', authority: '', due_date: '', notes: '' });
    fetchAll();
  };
  const completeCompliance = async (c: any) => {
    await supabase.from('compliance_items').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', c.id);
    fetchAll();
  };

  // ---- settings ----
  const [settingsForm, setSettingsForm] = useState<any>(null);
  useEffect(() => { if (settings) setSettingsForm(settings); }, [settings]);
  const saveSettings = async () => {
    const { error } = await supabase.from('corporate_settings').update({
      company_name: settingsForm.company_name,
      registration_number: settingsForm.registration_number,
      incorporation_date: settingsForm.incorporation_date || null,
      currency: settingsForm.currency,
      authorized_shares: num(settingsForm.authorized_shares),
      par_value: num(settingsForm.par_value),
      updated_by: user?.id,
    }).eq('id', settings.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Company details saved' });
    fetchAll();
  };

  const pendingApprovals = requests.filter((r) => r.status === 'pending_approval');
  const upcoming = compliance.filter((c) => c.status !== 'completed');

  const StatusBadge = ({ s }: { s: string }) => (
    <Badge variant="outline" className={STATUS_STYLE[s] || ''}>{STATUS_LABEL[s] || s}</Badge>
  );

  if (loading) {
    return <Layout><div className="p-8 text-muted-foreground">Loading corporate records…</div></Layout>;
  }

  if (!canView) {
    return (
      <Layout>
        <div className="p-8">
          <Card><CardContent className="p-8 text-center space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">Corporate Administration is restricted</p>
            <p className="text-sm text-muted-foreground">Only Admin Manager, Board, Accountant and Auditor roles can open this section.</p>
          </CardContent></Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 min-w-0 overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /> Corporate Administration</h1>
            <p className="text-sm text-muted-foreground">
              Admin Manager prepares · Board of Directors approves · Accountant records · Auditor reviews
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{isAdmin ? 'Admin Manager' : isBoard ? 'Board Member' : isAccountant ? 'Accountant' : 'Auditor'}</Badge>
            <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Dashboard</TabsTrigger>
            <TabsTrigger value="register">Share Register</TabsTrigger>
            <TabsTrigger value="requests">Board Requests</TabsTrigger>
            <TabsTrigger value="dividends">Dividends</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            {isAdmin && <TabsTrigger value="company">Company</TabsTrigger>}
          </TabsList>

          {/* ---------------- Dashboard ---------------- */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Total Authorized Shares', value: `${shareNum(authorized)} (${money(authorized * parValue)})`, icon: FileSignature },
                { label: 'Issued Shares', value: `${shareNum(totalIssued)} (${money(shareCapital)})`, icon: PieChart },
                { label: 'Available / Unissued Shares', value: `${shareNum(unissued)} (${money(unissued * parValue)})`, icon: Coins },
                { label: 'Total Shareholders', value: activeShareholders.length, icon: Users2 },
              ].map((c) => (
                <Card key={c.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <c.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-lg font-bold mt-1 truncate">{c.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
              {[
                { l: 'Authorized Share Capital', v: money(authorized * parValue) },
                { l: 'Issued Share Capital', v: money(shareCapital) },
                { l: 'Available / Unissued Capital', v: money(unissued * parValue) },
                { l: 'Net Company Worth', v: money(netCompanyWorth) },
              ].map((c) => (
                <Card key={c.l}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{c.l}</p><p className="font-bold truncate">{c.v}</p></CardContent></Card>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Issued shares are backed by the company's net worth: Net Company Worth ÷ Par Value ({money(parValue)} per share).
            </p>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4" /> Dividends & Debt Settlement</CardTitle>
                <CardDescription>Distributable cash = (Cash − Liabilities) × 70%, then each shareholder's outstanding loan is deducted.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Cash after payables</p><p className="font-bold">{money(cashAfterPayables)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Company reserve (30%)</p><p className="font-bold">{money(cashAfterPayables * 0.3)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Distributable cash</p><p className="font-bold text-primary">{money(distributableCash)}</p></div>
                </div>
                <div className="space-y-2">
                  {activeShareholders.map((h) => {
                    const gross = (distributableCash * pct(h)) / 100;
                    const loan = loanOf(h.id);
                    const deduction = Math.min(loan, gross);
                    const net = gross - deduction;
                    const remaining = loan - deduction;
                    return (
                      <div key={h.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium truncate">{h.full_name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{pct(h).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Gross cash distribution</span><span>{money(gross)}</span></div>
                        {deduction > 0 && <div className="flex justify-between text-xs text-warning"><span>Loan deduction</span><span>−{money(deduction)}</span></div>}
                        <div className="flex justify-between text-sm font-semibold"><span>Net payout</span><span className="text-success">{money(net)}</span></div>
                        {remaining > 0 && <div className="flex justify-between text-xs text-destructive"><span>Remaining debt</span><span>{money(remaining)}</span></div>}
                      </div>
                    );
                  })}
                  {activeShareholders.length === 0 && <p className="text-sm text-muted-foreground">No active shareholders.</p>}
                </div>
              </CardContent>
            </Card>


            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Pending Board Approvals</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {pendingApprovals.length === 0 && <p className="text-sm text-muted-foreground">Nothing awaiting the Board.</p>}
                  {pendingApprovals.map((r) => (
                    <button key={r.id} onClick={() => setDetail(r)} className="w-full text-left rounded-md border p-3 hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{r.reference_no} · {r.title}</span>
                        <StatusBadge s={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">Prepared by {profiles[r.prepared_by] || '—'}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><PieChart className="h-4 w-4" /> Ownership Distribution</CardTitle>
                  <CardDescription>Live from the existing shareholder register · shares ÷ total issued shares × 100</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {shareholders.length === 0 && <p className="text-sm text-muted-foreground">No shareholders in the existing register.</p>}
                  {activeShareholders.map((h) => (
                    <div key={h.id}>
                      <div className="flex justify-between text-sm gap-2">
                        <span className="truncate">{h.full_name}</span>
                        <span className="shrink-0">{pct(h).toFixed(2)}%</span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, pct(h))}%` }} /></div>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        {shareNum(sharesOf(h))} shares · {money(sharesOf(h) * parValue)} · {h.share_class || '—'} · Cert {h.certificate_number || '—'}
                      </p>
                    </div>
                  ))}
                  {totalIssued > 0 && (
                    <p className="text-[11px] text-muted-foreground border-t pt-2">
                      Total ownership of issued shares: {activeShareholders.reduce((s, h) => s + pct(h), 0).toFixed(2)}%
                    </p>
                  )}

                </CardContent>
              </Card>


              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Recent Share Transactions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {shareTx.slice(0, 6).map((t) => (
                    <div key={t.id} className="text-sm flex justify-between gap-2 border-b pb-1 last:border-0">
                      <span className="truncate">{shareholders.find((h) => h.id === t.shareholder_id)?.full_name || '—'} · {t.transaction_type.replace(/_/g, ' ')}</span>
                      <span className={num(t.shares_delta) < 0 ? 'text-destructive' : 'text-success'}>{num(t.shares_delta) > 0 ? '+' : ''}{num(t.shares_delta).toLocaleString()}</span>
                    </div>
                  ))}
                  {shareTx.length === 0 && <p className="text-sm text-muted-foreground">No share movements recorded.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Upcoming Compliance & Renewals</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No pending compliance tasks.</p>}
                  {upcoming.slice(0, 6).map((c) => {
                    const overdue = new Date(c.due_date) < new Date();
                    return (
                      <div key={c.id} className="text-sm flex justify-between gap-2">
                        <span className="truncate">{c.title}</span>
                        <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>{c.due_date}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------- Share Register ---------------- */}
          <TabsContent value="register" className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              {[
                { l: 'Authorized Shares', v: shareNum(authorized) },
                { l: 'Issued Shares', v: shareNum(totalIssued) },
                { l: 'Paid-up Amount', v: money(totalPaidUp) },
                { l: 'Available / Unissued', v: shareNum(unissued) },
                { l: 'Par Value', v: money(parValue) },

              ].map((c) => (
                <Card key={c.l}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{c.l}</p><p className="font-bold truncate">{c.v}</p></CardContent></Card>
              ))}
            </div>
            {authorized > 0 && totalIssued > authorized && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" /> Issued shares exceed authorized shares. Increase authorized capital via a Board-approved request.
              </div>
            )}
            <Card>
              <CardHeader><CardTitle className="text-base">Shareholder Register</CardTitle>
                <CardDescription>Ownership % is calculated automatically as shares ÷ total issued shares.</CardDescription></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Shareholder</TableHead><TableHead>ID</TableHead><TableHead>Shares</TableHead>
                    <TableHead>Class</TableHead><TableHead>Par</TableHead><TableHead>Paid-up</TableHead>
                    <TableHead>Ownership</TableHead><TableHead>Acquired</TableHead><TableHead>Certificate</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {shareholders.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{h.full_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.shareholder_code || h.id.slice(0, 8)}</TableCell>
                        <TableCell>{num(h.shares_owned).toLocaleString()}</TableCell>
                        <TableCell className="capitalize">{h.share_class}</TableCell>
                        <TableCell>{money(num(h.par_value))}</TableCell>
                        <TableCell>{money(num(h.paid_up_amount))}</TableCell>
                        <TableCell>{pct(h).toFixed(2)}%</TableCell>
                        <TableCell>{h.date_acquired || '—'}</TableCell>
                        <TableCell>{h.certificate_number || '—'}</TableCell>
                        <TableCell><Badge variant={h.status === 'active' ? 'default' : 'secondary'}>{h.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {shareholders.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No shareholders recorded.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Ownership History</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Shareholder</TableHead><TableHead>Type</TableHead><TableHead>Change</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {shareTx.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.transaction_date}</TableCell>
                        <TableCell>{shareholders.find((h) => h.id === t.shareholder_id)?.full_name || '—'}</TableCell>
                        <TableCell className="capitalize">{t.transaction_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell className={num(t.shares_delta) < 0 ? 'text-destructive' : 'text-success'}>{num(t.shares_delta) > 0 ? '+' : ''}{num(t.shares_delta).toLocaleString()}</TableCell>
                        <TableCell>{num(t.shares_before).toLocaleString()}</TableCell>
                        <TableCell>{num(t.shares_after).toLocaleString()}</TableCell>
                        <TableCell>{money(num(t.amount))}</TableCell>
                      </TableRow>
                    ))}
                    {shareTx.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No history yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Requests ---------------- */}
          <TabsContent value="requests" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Draft → Submitted → Pending Board Approval → Approved / Rejected → Executed → Recorded</p>
              {isAdmin && <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" />New Corporate Request</Button>}
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>Prepared by</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.reference_no}</TableCell>
                        <TableCell className="text-sm">{REQUEST_TYPES.find((t) => t.value === r.request_type)?.label || r.request_type}</TableCell>
                        <TableCell className="text-sm max-w-[220px] truncate">{r.title}</TableCell>
                        <TableCell className="text-sm">{profiles[r.prepared_by] || '—'}</TableCell>
                        <TableCell><StatusBadge s={r.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setDetail(r); setDecisionComment(''); }}>Open</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {requests.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No corporate requests yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Dividends ---------------- */}
          <TabsContent value="dividends" className="space-y-4">
            {dividends.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No dividends declared. Create a Dividend Declaration request — it becomes active only after Board approval and execution.</CardContent></Card>}
            {dividends.map((d) => {
              const rows = entitlements.filter((e) => e.declaration_id === d.id);
              const paid = rows.filter((e) => e.payment_status === 'paid').reduce((s, e) => s + num(e.amount), 0);
              return (
                <Card key={d.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      {d.reference_no} · {money(num(d.dividend_amount))}
                      <Badge variant="outline">{money(num(d.dividend_per_share))} / share</Badge>
                      <Badge variant="secondary">Paid {money(paid)}</Badge>
                    </CardTitle>
                    <CardDescription>Declared {d.declaration_date}{d.payment_date ? ` · Payable ${d.payment_date}` : ''} · Profit available {money(num(d.profit_available))}</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Shareholder</TableHead><TableHead>Shares</TableHead><TableHead>Entitlement</TableHead><TableHead>Status</TableHead>{isAdmin && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
                      <TableBody>
                        {rows.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>{shareholders.find((h) => h.id === e.shareholder_id)?.full_name || '—'}</TableCell>
                            <TableCell>{num(e.shares).toLocaleString()}</TableCell>
                            <TableCell>{money(num(e.amount))}</TableCell>
                            <TableCell><Badge variant={e.payment_status === 'paid' ? 'default' : 'secondary'}>{e.payment_status}</Badge></TableCell>
                            {isAdmin && <TableCell className="text-right">{e.payment_status !== 'paid' && <Button size="sm" variant="outline" onClick={() => markDividendPaid(e)}>Mark paid</Button>}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ---------------- Compliance ---------------- */}
          <TabsContent value="compliance" className="space-y-4">
            {isAdmin && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Add Filing / Renewal</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-5">
                  <Input placeholder="Title" value={compForm.title} onChange={(e) => setCompForm({ ...compForm, title: e.target.value })} />
                  <Select value={compForm.category} onValueChange={(v) => setCompForm({ ...compForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filing">Annual filing</SelectItem>
                      <SelectItem value="license">Licence renewal</SelectItem>
                      <SelectItem value="tax">Tax obligation</SelectItem>
                      <SelectItem value="registration">Registration</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Authority" value={compForm.authority} onChange={(e) => setCompForm({ ...compForm, authority: e.target.value })} />
                  <Input type="date" value={compForm.due_date} onChange={(e) => setCompForm({ ...compForm, due_date: e.target.value })} />
                  <Button onClick={addCompliance}><Plus className="h-4 w-4 mr-1" />Add</Button>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Category</TableHead><TableHead>Authority</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>{isAdmin && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
                  <TableBody>
                    {compliance.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.title}</TableCell>
                        <TableCell className="capitalize">{c.category}</TableCell>
                        <TableCell>{c.authority || '—'}</TableCell>
                        <TableCell className={c.status !== 'completed' && new Date(c.due_date) < new Date() ? 'text-destructive' : ''}>{c.due_date}</TableCell>
                        <TableCell><Badge variant={c.status === 'completed' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell>
                        {isAdmin && <TableCell className="text-right">{c.status !== 'completed' && <Button size="sm" variant="outline" onClick={() => completeCompliance(c)}>Complete</Button>}</TableCell>}
                      </TableRow>
                    ))}
                    {compliance.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No compliance tasks recorded.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Audit ---------------- */}
          <TabsContent value="audit">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" /> Corporate Audit Trail</CardTitle>
                <CardDescription>Immutable record — entries can never be edited or deleted.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date & time</TableHead><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Action</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead>Comments</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{profiles[a.actor_id] || 'System'}</TableCell>
                        <TableCell className="text-xs capitalize">{a.actor_role || '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{String(a.action).replace(/_/g, ' ')}</TableCell>
                        <TableCell className="font-mono text-xs">{a.reference_no || '—'}</TableCell>
                        <TableCell className="text-xs">{a.approval_status ? STATUS_LABEL[a.approval_status] || a.approval_status : '—'}</TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate">{a.comments || '—'}</TableCell>
                      </TableRow>
                    ))}
                    {audit.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No audit entries yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Company settings ---------------- */}
          {isAdmin && settingsForm && (
            <TabsContent value="company">
              <Card>
                <CardHeader><CardTitle className="text-base">Company & Capital Details</CardTitle>
                  <CardDescription>Authorized share capital and registration record.</CardDescription></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div><Label>Company name</Label><Input value={settingsForm.company_name || ''} onChange={(e) => setSettingsForm({ ...settingsForm, company_name: e.target.value })} /></div>
                  <div><Label>Registration number</Label><Input value={settingsForm.registration_number || ''} onChange={(e) => setSettingsForm({ ...settingsForm, registration_number: e.target.value })} /></div>
                  <div><Label>Incorporation date</Label><Input type="date" value={settingsForm.incorporation_date || ''} onChange={(e) => setSettingsForm({ ...settingsForm, incorporation_date: e.target.value })} /></div>
                  <div><Label>Currency</Label><Input value={settingsForm.currency || ''} onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })} /></div>
                  <div><Label>Authorized shares</Label><Input type="number" value={settingsForm.authorized_shares ?? ''} onChange={(e) => setSettingsForm({ ...settingsForm, authorized_shares: e.target.value })} /></div>
                  <div><Label>Par / nominal value</Label><Input type="number" step="0.01" value={settingsForm.par_value ?? ''} onChange={(e) => setSettingsForm({ ...settingsForm, par_value: e.target.value })} /></div>
                  <div className="md:col-span-2"><Button onClick={saveSettings}>Save</Button></div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ---------------- New request dialog ---------------- */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Corporate Request</DialogTitle>
            <DialogDescription>Prepared by the Admin Manager. It only takes effect after Board approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Request type</Label>
                <Select value={form.request_type} onValueChange={(v) => set('request_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REQUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Increase share capital by $50,000" /></div>
            </div>

            {['share_issuance', 'capital_increase', 'capital_decrease'].includes(form.request_type) && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 md:grid-cols-3 text-sm">
                  <div><Label>Current capital</Label><Input value={money(shareCapital)} readOnly /></div>
                  <div><Label>Current shares</Label><Input value={totalIssued.toLocaleString()} readOnly /></div>
                  <div><Label>Nominal value</Label><Input type="number" step="0.01" value={form.nominal_value} onChange={(e) => set('nominal_value', e.target.value)} placeholder={String(parValue)} /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div><Label>Additional shares</Label><Input type="number" value={form.additional_shares} onChange={(e) => set('additional_shares', e.target.value)} /></div>
                  <div><Label>New share capital</Label>
                    <Input readOnly value={money((totalIssued + (form.request_type === 'capital_decrease' ? -1 : 1) * num(form.additional_shares)) * (num(form.nominal_value) || parValue))} /></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label>Proposed allocation</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAllocations([...allocations, { shareholder_id: '', shares: '', amount: '' }])}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                  {allocations.map((a, i) => (
                    <div key={i} className="grid gap-2 md:grid-cols-[1fr_120px_120px_40px]">
                      <Select value={a.shareholder_id} onValueChange={(v) => setAllocations(allocations.map((x, j) => j === i ? { ...x, shareholder_id: v } : x))}>
                        <SelectTrigger><SelectValue placeholder="Shareholder" /></SelectTrigger>
                        <SelectContent>{shareholders.map((h) => <SelectItem key={h.id} value={h.id}>{h.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input placeholder="Shares" type="number" value={a.shares} onChange={(e) => setAllocations(allocations.map((x, j) => j === i ? { ...x, shares: e.target.value } : x))} />
                      <Input placeholder="Amount paid" type="number" value={a.amount} onChange={(e) => setAllocations(allocations.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setAllocations(allocations.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {form.request_type === 'new_shareholder' && (
              <div className="grid gap-3 md:grid-cols-2 rounded-md border p-3">
                <div><Label>Full name</Label><Input value={form.new_name} onChange={(e) => set('new_name', e.target.value)} /></div>
                <div><Label>Email</Label><Input value={form.new_email} onChange={(e) => set('new_email', e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={form.new_phone} onChange={(e) => set('new_phone', e.target.value)} /></div>
                <div><Label>Shares to allocate</Label>
                  <Input type="number" value={allocations[0]?.shares || ''} onChange={(e) => setAllocations([{ shareholder_id: '', shares: e.target.value, amount: allocations[0]?.amount || '' }])} /></div>
                <div><Label>Amount paid</Label>
                  <Input type="number" value={allocations[0]?.amount || ''} onChange={(e) => setAllocations([{ shareholder_id: '', shares: allocations[0]?.shares || '', amount: e.target.value }])} /></div>
              </div>
            )}

            {(form.request_type === 'share_transfer' || form.request_type === 'remove_shareholder') && (
              <div className="grid gap-3 md:grid-cols-2 rounded-md border p-3">
                <div><Label>{form.request_type === 'share_transfer' ? 'Transferor' : 'Shareholder'}</Label>
                  <Select value={form.transferor_id} onValueChange={(v) => set('transferor_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{shareholders.map((h) => <SelectItem key={h.id} value={h.id}>{h.full_name} ({num(h.shares_owned).toLocaleString()})</SelectItem>)}</SelectContent>
                  </Select></div>
                {form.request_type === 'share_transfer' && (
                  <>
                    <div><Label>Transferee</Label>
                      <Select value={form.transferee_id} onValueChange={(v) => set('transferee_id', v)}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{shareholders.map((h) => <SelectItem key={h.id} value={h.id}>{h.full_name}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div><Label>Number of shares</Label><Input type="number" value={form.transfer_shares} onChange={(e) => set('transfer_shares', e.target.value)} /></div>
                    <div><Label>Transfer price / share</Label><Input type="number" step="0.01" value={form.transfer_price} onChange={(e) => set('transfer_price', e.target.value)} /></div>
                    <div><Label>Transfer date</Label><Input type="date" value={form.transfer_date} onChange={(e) => set('transfer_date', e.target.value)} /></div>
                  </>
                )}
              </div>
            )}

            {form.request_type === 'dividend' && (
              <div className="grid gap-3 md:grid-cols-2 rounded-md border p-3">
                <div><Label>Profit available for distribution</Label><Input type="number" value={form.profit_available} onChange={(e) => set('profit_available', e.target.value)} /></div>
                <div><Label>Dividend amount</Label><Input type="number" value={form.dividend_amount} onChange={(e) => set('dividend_amount', e.target.value)} /></div>
                <div><Label>Declaration date</Label><Input type="date" value={form.declaration_date} onChange={(e) => set('declaration_date', e.target.value)} /></div>
                <div><Label>Payment date</Label><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} /></div>
                <div className="md:col-span-2 text-sm text-muted-foreground">
                  Dividend per share: {money(totalIssued > 0 ? num(form.dividend_amount) / totalIssued : 0)} over {totalIssued.toLocaleString()} issued shares.
                </div>
              </div>
            )}

            <div><Label>Reason / justification</Label><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} rows={2} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} /></div>
            <div>
              <Label className="flex items-center gap-2"><Upload className="h-4 w-4" /> Supporting documents</Label>
              <Input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => createRequest(false)}>Save as draft</Button>
            <Button disabled={busy} onClick={() => createRequest(true)}><Send className="h-4 w-4 mr-1" />Submit to Board</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Request detail dialog ---------------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{detail.reference_no}</span> {detail.title}
                  <StatusBadge s={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  {REQUEST_TYPES.find((t) => t.value === detail.request_type)?.label} · Prepared by {profiles[detail.prepared_by] || '—'}
                  {detail.decided_by ? ` · Decided by ${profiles[detail.decided_by] || '—'}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                {detail.reason && <p><span className="text-muted-foreground">Reason: </span>{detail.reason}</p>}
                {detail.description && <p><span className="text-muted-foreground">Description: </span>{detail.description}</p>}
                <div className="rounded-md border p-3 space-y-1">
                  {Object.entries(detail.details || {})
                    .filter(([k, v]) => !['title', 'description', 'reason', 'request_type', 'allocations'].includes(k) && v !== '' && v !== null)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="text-right truncate">
                          {k.endsWith('_id') ? (shareholders.find((h) => h.id === v)?.full_name || String(v)) : String(v)}
                        </span>
                      </div>
                    ))}
                  {(detail.details?.allocations || []).length > 0 && (
                    <div className="pt-2">
                      <p className="text-muted-foreground mb-1">Proposed allocation</p>
                      {detail.details.allocations.map((a: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{shareholders.find((h) => h.id === a.shareholder_id)?.full_name || a.new_name || 'New shareholder'}</span>
                          <span>{num(a.shares).toLocaleString()} shares · {money(num(a.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">Supporting documents</p>
                  {docs.filter((d) => d.request_id === detail.id).length === 0 && <p className="text-xs text-muted-foreground">None attached.</p>}
                  {docs.filter((d) => d.request_id === detail.id).map((d) => (
                    <button key={d.id} className="block text-primary underline text-xs" onClick={() => openDoc(d.file_path)}>{d.file_name}</button>
                  ))}
                </div>

                {detail.decision_comment && (
                  <div className="rounded-md border p-3"><span className="text-muted-foreground">Board comment: </span>{detail.decision_comment}</div>
                )}

                {isBoard && ['pending_approval', 'changes_requested'].includes(detail.status) && (
                  <div className="space-y-2">
                    <Label>Comment / reason (required to reject or request changes)</Label>
                    <Textarea rows={2} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                {isAdmin && ['draft', 'changes_requested'].includes(detail.status) && (
                  <Button onClick={() => submitRequest(detail)}><Send className="h-4 w-4 mr-1" />Submit to Board</Button>
                )}
                {isBoard && ['pending_approval', 'changes_requested'].includes(detail.status) && (
                  <>
                    <Button variant="outline" onClick={() => decide(detail, 'changes_requested')}><RotateCcw className="h-4 w-4 mr-1" />Request changes</Button>
                    <Button variant="destructive" onClick={() => decide(detail, 'rejected')}><X className="h-4 w-4 mr-1" />Reject</Button>
                    <Button onClick={() => decide(detail, 'approved')}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  </>
                )}
                {isAdmin && detail.status === 'approved' && (
                  <Button disabled={busy} onClick={() => execute(detail)}><Play className="h-4 w-4 mr-1" />Execute & update register</Button>
                )}
                {detail.status === 'executed' && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><ClipboardList className="h-3 w-3" />Executed and recorded — permanent record.</span>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
