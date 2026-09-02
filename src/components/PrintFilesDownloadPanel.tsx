import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileDown, Paperclip, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PrintFileRequest {
  id: string;
  customer_name: string;
  company_name: string | null;
  description: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
}

interface ReqFile {
  id: string;
  request_id: string;
  file_name: string;
  file_path: string;
}

// Read-only panel for the print operator: download files sent by sales.
// No proceed / invoice actions. Filtered to today by default.
export const PrintFilesDownloadPanel = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PrintFileRequest[]>([]);
  const [files, setFiles] = useState<Record<string, ReqFile[]>>({});
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');

  const fetchData = async () => {
    if (!user?.id) return;
    // Print operators can see every job sent by sales (with attachments), not only assigned ones
    const { data } = await supabase
      .from('sales_order_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    const list = ((data as any) || []) as PrintFileRequest[];

    const reqIds = list.map(r => r.id);
    if (reqIds.length) {
      const { data: fs } = await supabase
        .from('request_files')
        .select('id, request_id, file_name, file_path')
        .in('request_id', reqIds.slice(0, 500));
      const fmap: Record<string, ReqFile[]> = {};
      ((fs as any) || []).forEach((f: ReqFile) => {
        (fmap[f.request_id] ||= []).push(f);
      });
      setFiles(fmap);
    } else {
      setFiles({});
    }

    const ids = [...new Set(list.map(r => r.created_by).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setSenders(map);
    }

    // Keep only requests that actually have files attached
    setRequests(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const ch = supabase
      .channel('print-files-download')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_requests' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'request_files' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  if (loading) return null;

  const withFiles = requests.filter(r => (files[r.id] || []).length > 0);
  const filtered = withFiles.filter(r => {
    if (dateFilter === 'all') return true;
    const d = new Date(r.created_at);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (dateFilter === 'today') return d.toDateString() === now.toDateString();
    if (dateFilter === 'week') return diffMs <= 7 * 86400000;
    if (dateFilter === 'month') return diffMs <= 30 * 86400000;
    return true;
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileDown className="h-5 w-5 text-primary" />
            Print Files from Sales
            {filtered.length > 0 && <Badge variant="secondary">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</Badge>}
          </CardTitle>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
            <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dateFilter === 'today' ? 'No files received today. Change the filter to see older files.' : 'No files in this range.'}
          </p>
        ) : (
          <div className="grid gap-3">
            {filtered.map(r => {
              const att = files[r.id] || [];
              const senderName = r.created_by ? senders[r.created_by] : null;
              return (
                <div key={r.id} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.customer_name}</span>
                    <Badge variant="outline" className="text-xs gap-1"><Paperclip className="h-3 w-3" />{att.length}</Badge>
                    {r.status === 'printed' && <Badge className="text-xs bg-teal-500 text-white">Printed</Badge>}
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                    {senderName && <span>Sent by: <span className="text-foreground">{senderName}</span></span>}
                    {r.company_name && <span>Company: <span className="text-foreground">{r.company_name}</span></span>}
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {att.map(f => (
                      <Button key={f.id} variant="outline" size="sm" className="gap-1 max-w-[220px]" onClick={() => downloadFile(f.file_path, f.file_name)}>
                        <Download className="h-3.5 w-3.5" />
                        <span className="truncate">{f.file_name}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
