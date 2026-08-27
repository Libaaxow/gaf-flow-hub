import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Archive, ClipboardList, Paperclip, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SalesRequest {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  company_name: string | null;
  description: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
  created_by: string | null;
}

interface ReqFile {
  id: string;
  request_id: string;
  file_name: string;
  file_path: string;
}

export const SalesRequestsPanel = () => {
  const [pending, setPending] = useState<SalesRequest[]>([]);
  const [processed, setProcessed] = useState<SalesRequest[]>([]);
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, ReqFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'processed'>('pending');
  const [doneFilter, setDoneFilter] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [detail, setDetail] = useState<SalesRequest | null>(null);

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('sales_order_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    const list = ((data as any) || []) as SalesRequest[];
    setPending(list.filter(r => r.status === 'pending'));
    setProcessed(list.filter(r => r.status !== 'pending'));

    const ids = [...new Set(list.map(r => r.created_by).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setSenders(map);
    }

    const reqIds = list.map(r => r.id);
    if (reqIds.length) {
      const { data: fs } = await supabase
        .from('request_files')
        .select('id, request_id, file_name, file_path')
        .in('request_id', reqIds.slice(0, 200));
      const fmap: Record<string, ReqFile[]> = {};
      ((fs as any) || []).forEach((f: ReqFile) => {
        (fmap[f.request_id] ||= []).push(f);
      });
      setFiles(fmap);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
    const ch = supabase
      .channel('accountant-sales-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_requests' }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from('request-files').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const downloadFile = async (path: string, name: string) => {
    try {
      const { data, error } = await supabase.storage.from('request-files').download(path);
      if (error || !data) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download file');
    }
  };

  const [processingId, setProcessingId] = useState<string | null>(null);

  const markProcessed = async (r: SalesRequest) => {
    setProcessingId(r.id);
    const { error } = await supabase
      .from('sales_order_requests')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', r.id);
    setProcessingId(null);
    if (error) {
      toast.error('Could not move request');
      return;
    }
    toast.success('Moved to Processed');
    setDetail(null);
    setTab('processed');
    fetchRequests();
  };

  const renderItem = (r: SalesRequest, isProcessed: boolean) => {
    const senderName = r.created_by ? senders[r.created_by] : null;
    const att = files[r.id] || [];
    return (
      <div
        key={r.id}
        onClick={() => setDetail(r)}
        className="text-left rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors w-full min-w-0 cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{r.customer_name}</span>
          {isProcessed && <Badge variant="secondary" className="text-xs">{r.status.replace('_', ' ')}</Badge>}
          {att.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1"><Paperclip className="h-3 w-3" />{att.length}</Badge>
          )}
        </div>
        {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
          {senderName && <span>Sent by: <span className="text-foreground">{senderName}</span></span>}
          {r.customer_phone && <span>Phone: <span className="text-foreground">{r.customer_phone}</span></span>}
          {r.company_name && <span>Company: <span className="text-foreground">{r.company_name}</span></span>}
          <span>{new Date(r.created_at).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
          {att.map(f => (
            <Button key={f.id} variant="outline" size="sm" className="gap-1 max-w-[220px]" onClick={() => downloadFile(f.file_path, f.file_name)}>
              <Download className="h-3.5 w-3.5" />
              <span className="truncate">{f.file_name}</span>
            </Button>
          ))}
          {!isProcessed && (
            <Button size="sm" className="gap-1" disabled={processingId === r.id} onClick={() => markProcessed(r)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Proceed
            </Button>
          )}
        </div>
      </div>
    );
  };


  if (loading) return null;

  const filteredProcessed = processed.filter(r => {
    if (doneFilter === 'all') return true;
    const d = new Date(r.processed_at || r.updated_at || r.created_at);
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
            <ClipboardList className="h-5 w-5 text-primary" />
            Sales Order Requests
            {pending.length > 0 && <Badge variant="secondary">{pending.length} pending</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'processed')}>
            <TabsList className="mb-3">
              <TabsTrigger value="pending" className="gap-2">
                <Inbox className="h-4 w-4" /> Pending
                {pending.length > 0 && <Badge variant="secondary" className="ml-1">{pending.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="processed" className="gap-2">
                <Archive className="h-4 w-4" /> Processed
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests from sales.</p>
              ) : (
                <div className="grid gap-3">{pending.map(r => renderItem(r, false))}</div>
              )}
            </TabsContent>
            <TabsContent value="processed">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Showing {filteredProcessed.length} of {processed.length}</span>
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
              {filteredProcessed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests in this range.</p>
              ) : (
                <div className="grid gap-3">{filteredProcessed.map(r => renderItem(r, true))}</div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {detail && (
        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Request Details</DialogTitle></DialogHeader>
            <div className="grid gap-2 text-sm">
              {([
                ['Sent by', (detail.created_by && senders[detail.created_by]) || '—'],
                ['Customer', detail.customer_name || '—'],
                ['Phone', detail.customer_phone || '—'],
                ['Email', detail.customer_email || '—'],
                ['Company', detail.company_name || '—'],
                ['Description', detail.description || '—'],
                ['Notes', detail.notes || '—'],
                ['Status', detail.status.replace('_', ' ')],
                ['Sent at', new Date(detail.created_at).toLocaleString()],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground shrink-0">{k}</span>
                  <span className="text-right font-medium break-words">{v}</span>
                </div>
              ))}
            </div>
            {(files[detail.id] || []).length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Attachments</p>
                {(files[detail.id] || []).map(f => (
                  <Button key={f.id} variant="outline" size="sm" className="justify-start gap-2" onClick={() => openFile(f.file_path)}>
                    <Download className="h-4 w-4" />
                    <span className="truncate">{f.file_name}</span>
                  </Button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
