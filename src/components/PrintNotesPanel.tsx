import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StickyNote, Inbox, Archive, CheckCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PrintNote {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  company_name: string | null;
  description: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
  created_by: string | null;
  designer_id: string | null;
}

export const PrintNotesPanel = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<PrintNote[]>([]);
  const [done, setDone] = useState<PrintNote[]>([]);
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [doneFilter, setDoneFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [detail, setDetail] = useState<PrintNote | null>(null);

  const fetchNotes = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('sales_order_requests')
      .select('*')
      .eq('print_operator_id', user.id)
      .in('status', ['in_print', 'printed'])
      .order('created_at', { ascending: false });
    const list = ((data as any) || []) as PrintNote[];
    setPending(list.filter(l => l.status === 'in_print'));
    setDone(list.filter(l => l.status === 'printed'));

    const ids = [...new Set(list.flatMap(l => [l.created_by, l.designer_id]).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setSenders(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
    const ch = supabase
      .channel('print-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_requests' }, () => fetchNotes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const renderNote = (n: PrintNote, isDone: boolean) => {
    const senderName = n.created_by ? senders[n.created_by] : null;
    const designerName = n.designer_id ? senders[n.designer_id] : null;
    return (
      <button
        key={n.id}
        type="button"
        onClick={() => setDetail(n)}
        className="text-left rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors w-full"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {senderName ? `${senderName} — ${n.customer_name}` : n.customer_name}
          </span>
          {designerName && <Badge variant="outline" className="text-xs">Designer: {designerName}</Badge>}
          {isDone && <Badge className="text-xs gap-1"><CheckCircle className="h-3 w-3" />Printed</Badge>}
        </div>
        {n.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
          {senderName && <span>Sent by: <span className="text-foreground">{senderName}</span></span>}
          {n.customer_phone && <span>Phone: <span className="text-foreground">{n.customer_phone}</span></span>}
          {n.company_name && <span>Company: <span className="text-foreground">{n.company_name}</span></span>}
          <span>{new Date(n.created_at).toLocaleString()}</span>
        </div>
      </button>
    );
  };

  if (loading) return null;

  const filteredDone = done.filter(n => {
    if (doneFilter === 'all') return true;
    const d = new Date(n.processed_at || n.updated_at || n.created_at);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (doneFilter === 'today') return d.toDateString() === now.toDateString();
    if (doneFilter === 'week') return diffMs <= 7 * 86400000;
    if (doneFilter === 'month') return diffMs <= 30 * 86400000;
    return true;
  });

  return (
    <>
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <StickyNote className="h-5 w-5 text-primary" />
          Jobs Sent to You
          {pending.length > 0 && <Badge variant="secondary">{pending.length} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'done')}>
          <TabsList className="mb-3">
            <TabsTrigger value="pending" className="gap-2">
              <Inbox className="h-4 w-4" /> Pending
              {pending.length > 0 && <Badge variant="secondary" className="ml-1">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="done" className="gap-2">
              <Archive className="h-4 w-4" /> Printed
              {done.length > 0 && <Badge variant="secondary" className="ml-1">{done.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending jobs. Print jobs assigned to you will appear here.</p>
            ) : (
              <div className="grid gap-3">{pending.map(n => renderNote(n, false))}</div>
            )}
          </TabsContent>
          <TabsContent value="done">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Showing {filteredDone.length} of {done.length}</span>
              <Select value={doneFilter} onValueChange={(v) => setDoneFilter(v as any)}>
                <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredDone.length === 0 ? (
              <p className="text-sm text-muted-foreground">No printed jobs in this range.</p>
            ) : (
              <div className="grid gap-3">{filteredDone.map(n => renderNote(n, true))}</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    {detail && (() => {
      const senderName = detail.created_by ? senders[detail.created_by] : null;
      const designerName = detail.designer_id ? senders[detail.designer_id] : null;
      const rows: [string, any][] = [
        ['Sent by', senderName || '—'],
        ['Designer', designerName || '—'],
        ['Customer', detail.customer_name || '—'],
        ['Phone', detail.customer_phone || '—'],
        ['Company', detail.company_name || '—'],
        ['Description', detail.description || '—'],
        ['Notes', detail.notes || '—'],
        ['Status', detail.status === 'printed' ? 'Printed' : 'In Print'],
        ['Sent at', new Date(detail.created_at).toLocaleString()],
      ];
      return (
        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Job Details</DialogTitle></DialogHeader>
            <div className="grid gap-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground shrink-0">{k}</span>
                  <span className="text-right font-medium break-words">{v}</span>
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