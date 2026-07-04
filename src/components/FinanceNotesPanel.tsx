import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, StickyNote, FileText, Inbox, Archive } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LeadNote {
  id: string;
  title: string;
  description: string | null;
  customer_id: string | null;
  owner_id: string;
  created_at: string;
  created_by_role: string | null;
  quantity: number | null;
  amount: number | null;
  status: string;
  updated_at?: string | null;
}

export const FinanceNotesPanel = () => {
  const { toast } = useToast();
  const [pending, setPending] = useState<LeadNote[]>([]);
  const [recorded, setRecorded] = useState<LeadNote[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'recorded'>('pending');
  const [recordedFilter, setRecordedFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [detail, setDetail] = useState<LeadNote | null>(null);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .in('status', ['sent_to_finance', 'processed'])
      .order('created_at', { ascending: false });
    const list = ((data as any) || []) as LeadNote[];
    setPending(list.filter(l => l.status === 'sent_to_finance'));
    setRecorded(list.filter(l => l.status === 'processed'));

    const custIds = [...new Set(list.map((l: LeadNote) => l.customer_id).filter(Boolean))];
    if (custIds.length) {
      const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', custIds as string[]);
      const map: Record<string, any> = {};
      (cs || []).forEach((c: any) => { map[c.id] = c; });
      setCustomers(map);
    }
    const ownerIds = [...new Set(list.map((l: LeadNote) => l.owner_id).filter(Boolean))];
    if (ownerIds.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ownerIds as string[]);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setOwners(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
    const ch = supabase
      .channel('finance-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchNotes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);


  const reopenNote = async (id: string) => {
    const { error } = await supabase.from('leads').update({ status: 'sent_to_finance' }).eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Moved back to Pending' });
    fetchNotes();
  };

  const markRecorded = async (id: string) => {
    const { error } = await supabase.from('leads').update({ status: 'processed' }).eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Marked as recorded' });
    fetchNotes();
  };

  const openInvoiceCreate = (leadId: string) => {
    window.dispatchEvent(new CustomEvent('open-create-invoice', { detail: { leadId } }));
    const el = document.getElementById('invoices-section') || document.querySelector('[data-invoices-section]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderNote = (n: LeadNote, isRecorded: boolean) => {
    const cust = n.customer_id ? customers[n.customer_id] : null;
    return (
      <div key={n.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <button
          type="button"
          onClick={() => setDetail(n)}
          className="min-w-0 flex-1 text-left hover:bg-muted/40 rounded-md -m-1 p-1 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2">
            {owners[n.owner_id] ? (
              <span className="font-medium">{owners[n.owner_id]}</span>
            ) : (
              <span className="font-medium">{n.title}</span>
            )}
            {n.created_by_role && <Badge variant="outline" className="text-xs">{n.created_by_role}</Badge>}
            {isRecorded && <Badge className="text-xs gap-1"><CheckCircle className="h-3 w-3" />Recorded</Badge>}
          </div>
          {n.description && <p className="text-sm text-muted-foreground mt-1">{n.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            {owners[n.owner_id] && <span>Sent by: <span className="text-foreground">{owners[n.owner_id]}</span>{n.created_by_role ? ` (${n.created_by_role})` : ''}</span>}
            {cust && <span>Customer: <span className="text-foreground">{cust.name}</span>{cust.phone ? ` · ${cust.phone}` : ''}</span>}
            {n.quantity != null && <span>Qty: <span className="text-foreground">{n.quantity}</span></span>}
            {n.amount != null && <span>Amount: <span className="text-foreground">${Number(n.amount).toLocaleString()}</span></span>}
            <span>{new Date(n.created_at).toLocaleString()}</span>
          </div>
        </button>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!isRecorded && (
            <>
              <Button size="sm" onClick={() => openInvoiceCreate(n.id)} className="gap-2">
                <FileText className="h-4 w-4" /> Create Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={() => markRecorded(n.id)} className="gap-2">
                <CheckCircle className="h-4 w-4" /> Mark Recorded
              </Button>
            </>
          )}
          {isRecorded && (
            <Button size="sm" variant="outline" onClick={() => reopenNote(n.id)} className="gap-2">
              <Inbox className="h-4 w-4" /> Reopen
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (loading) return null;

  const filteredRecorded = recorded.filter(n => {
    if (recordedFilter === 'all') return true;
    const d = new Date(n.updated_at || n.created_at);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (recordedFilter === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (recordedFilter === 'week') return diffMs <= 7 * 86400000;
    if (recordedFilter === 'month') return diffMs <= 30 * 86400000;
    return true;
  });

  return (
    <>
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <StickyNote className="h-5 w-5 text-primary" />
          Notes from Sales & Design
          {pending.length > 0 && <Badge variant="secondary">{pending.length} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'recorded')}>
          <TabsList className="mb-3">
            <TabsTrigger value="pending" className="gap-2">
              <Inbox className="h-4 w-4" /> Pending
              {pending.length > 0 && <Badge variant="secondary" className="ml-1">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="recorded" className="gap-2">
              <Archive className="h-4 w-4" /> Recorded
              {recorded.length > 0 && <Badge variant="secondary" className="ml-1">{recorded.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending notes. New requests from sales and designers will appear here as a reference for creating invoices.</p>
            ) : (
              <div className="grid gap-3">{pending.map(n => renderNote(n, false))}</div>
            )}
          </TabsContent>
          <TabsContent value="recorded">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs text-muted-foreground">
                Showing {filteredRecorded.length} of {recorded.length}
              </span>
              <Select value={recordedFilter} onValueChange={(v) => setRecordedFilter(v as any)}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredRecorded.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded notes in this range.</p>
            ) : (
              <div className="grid gap-3">{filteredRecorded.map(n => renderNote(n, true))}</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    {detail && (() => {
      const cust = detail.customer_id ? customers[detail.customer_id] : null;
      const rows: [string, any][] = [
        ['Title', detail.title],
        ['Customer name', cust?.name || '—'],
        ['Phone', cust?.phone || '—'],
        ['Job size', detail.description?.replace(/^Size:\s*/, '').split(' · ')[0] || '—'],
        ['Quantity', detail.quantity ?? '—'],
        ['Amount', detail.amount != null ? `$${Number(detail.amount).toLocaleString()}` : '—'],
        ['Created by', owners[detail.owner_id] || '—'],
        ['Role', detail.created_by_role || '—'],
        ['Status', detail.status === 'processed' ? 'Recorded' : 'Pending'],
        ['Sent at', new Date(detail.created_at).toLocaleString()],
      ];
      return (
        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Note Details</DialogTitle></DialogHeader>
            <div className="grid gap-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right font-medium">{v}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
};
