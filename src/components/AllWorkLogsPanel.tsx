import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList } from 'lucide-react';

interface WorkLog {
  id: string;
  operator_id: string;
  log_date: string;
  log_time: string;
  job_name: string;
  work_type: string | null;
  quantity: number | null;
  price: number | null;
  status: string;
  notes: string | null;
  photo_path: string | null;
  photo_paths?: string[] | null;
}

const statusLabel: Record<string, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  pending: 'Pending',
};

type RangeKey = 'today' | '7d' | '30d' | 'all';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All' },
];

export const AllWorkLogsPanel = () => {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [range, setRange] = useState<RangeKey>('today');
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    let query = supabase.from('work_logs').select('*').order('log_date', { ascending: false }).order('log_time', { ascending: false });

    if (range !== 'all') {
      const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
      const from = new Date();
      from.setDate(from.getDate() - days);
      query = query.gte('log_date', from.toISOString().slice(0, 10));
    }

    const { data } = await query;
    const list = (data || []) as WorkLog[];
    setLogs(list);

    const ids = [...new Set(list.map(l => l.operator_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach(p => { map[p.id] = p.full_name; });
      setNames(map);
    }

    const paths = [...new Set(
      list.flatMap(l => (l.photo_paths?.length ? l.photo_paths : l.photo_path ? [l.photo_path] : []))
    )] as string[];
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('work-log-photos').createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (signed || []).forEach(s => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
      setPhotoUrls(map);
    } else {
      setPhotoUrls({});
    }
  }, [range]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalValue = logs.reduce((s, l) => s + Number(l.price || 0), 0);

  return (
    <Card className="border-primary/40 w-full min-w-0">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5 text-primary" />
          Daily Work Log
          {logs.length > 0 && <Badge variant="secondary">{logs.length} jobs</Badge>}
          <Badge variant="outline">${totalValue.toFixed(2)}</Badge>
        </CardTitle>
        <div className="flex gap-1 flex-wrap">
          {RANGES.map(r => (
            <Button key={r.key} size="sm" variant={range === r.key ? 'default' : 'outline'} onClick={() => setRange(r.key)}>
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto custom-scrollbar">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No recorded work for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[100px]">Date</TableHead>
                <TableHead className="min-w-[80px]">Time</TableHead>
                <TableHead className="min-w-[140px]">Operator</TableHead>
                <TableHead className="min-w-[160px]">File / Job Name</TableHead>
                <TableHead className="min-w-[140px]">Work Type</TableHead>
                <TableHead className="min-w-[70px]">Qty</TableHead>
                <TableHead className="min-w-[90px]">Price</TableHead>
                <TableHead className="min-w-[110px]">Status</TableHead>
                <TableHead className="min-w-[90px]">Photo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{l.log_date}</TableCell>
                  <TableCell>{l.log_time?.slice(0, 5)}</TableCell>
                  <TableCell>{names[l.operator_id] || '—'}</TableCell>
                  <TableCell className="font-medium">{l.job_name}</TableCell>
                  <TableCell>{l.work_type || '—'}</TableCell>
                  <TableCell>{l.quantity ?? '—'}</TableCell>
                  <TableCell>{l.price != null ? `$${Number(l.price).toFixed(2)}` : '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{statusLabel[l.status] || l.status}</Badge></TableCell>
                  <TableCell>
                    {(() => {
                      const paths = (l.photo_paths?.length ? l.photo_paths : l.photo_path ? [l.photo_path] : []).filter(p => photoUrls[p]);
                      if (!paths.length) return <span className="text-muted-foreground text-xs">—</span>;
                      return (
                        <div className="flex gap-1">
                          {paths.map(p => (
                            <button key={p} type="button" onClick={() => setViewPhoto(photoUrls[p])}>
                              <img src={photoUrls[p]} alt={`Proof for ${l.job_name}`} className="h-10 w-10 rounded object-cover border" />
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!viewPhoto} onOpenChange={(o) => !o && setViewPhoto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Photo Proof</DialogTitle></DialogHeader>
          {viewPhoto && <img src={viewPhoto} alt="Work log photo proof" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
