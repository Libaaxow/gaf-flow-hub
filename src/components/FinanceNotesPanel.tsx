import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, StickyNote, FileText, Inbox, Archive } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
}

export const FinanceNotesPanel = () => {
  const { toast } = useToast();
  const [pending, setPending] = useState<LeadNote[]>([]);
  const [recorded, setRecorded] = useState<LeadNote[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'recorded'>('pending');

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

  const markProcessed = async (id: string) => {
    const { error } = await supabase.from('leads').update({ status: 'processed' }).eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Note recorded', description: 'Moved to Recorded tab for your records.' });
    fetchNotes();
  };

  const reopenNote = async (id: string) => {
    const { error } = await supabase.from('leads').update({ status: 'sent_to_finance' }).eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Moved back to Pending' });
    fetchNotes();
  };

  const openInvoiceCreate = () => {
    window.dispatchEvent(new CustomEvent('open-create-invoice'));
    const el = document.getElementById('invoices-section') || document.querySelector('[data-invoices-section]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderNote = (n: LeadNote, isRecorded: boolean) => {
    const cust = n.customer_id ? customers[n.customer_id] : null;
    return (
      <div key={n.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{n.title}</span>
            {n.created_by_role && <Badge variant="outline" className="text-xs">{n.created_by_role}</Badge>}
            {isRecorded && <Badge className="text-xs gap-1"><CheckCircle className="h-3 w-3" />Recorded</Badge>}
          </div>
          {n.description && <p className="text-sm text-muted-foreground mt-1">{n.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            {cust && <span>Customer: <span className="text-foreground">{cust.name}</span>{cust.phone ? ` · ${cust.phone}` : ''}</span>}
            {n.quantity != null && <span>Qty: <span className="text-foreground">{n.quantity}</span></span>}
            {n.amount != null && <span>Amount: <span className="text-foreground">${Number(n.amount).toLocaleString()}</span></span>}
            {owners[n.owner_id] && <span>By: <span className="text-foreground">{owners[n.owner_id]}</span></span>}
            <span>{new Date(n.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!isRecorded && (
            <>
              <Button size="sm" onClick={openInvoiceCreate} className="gap-2">
                <FileText className="h-4 w-4" /> Create Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={() => markProcessed(n.id)} className="gap-2">
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

  return (
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
            {recorded.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded notes yet. Notes you mark as recorded will appear here for future reference.</p>
            ) : (
              <div className="grid gap-3">{recorded.map(n => renderNote(n, true))}</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
