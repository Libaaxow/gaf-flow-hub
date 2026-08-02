import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList, Plus, Camera, Upload, X, Check, ImageIcon, ListChecks, CheckCircle2, Clock, Loader2, DollarSign } from 'lucide-react';

const WORK_TYPES = [
  'Digital Printing',
  'Large Format Printing',
  'Graphic Design',
  'Branding',
  'Cutting',
  'Binding',
  'Lamination',
  'Installation',
  'Delivery',
  'Other',
];

const STATUSES = ['done', 'in_progress', 'pending'] as const;

const statusLabel: Record<string, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  pending: 'Pending',
};

interface WorkLog {
  id: string;
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
  created_at: string;
}

const emptyForm = {
  job_name: '',
  work_type: '',
  quantity: '',
  price: '',
  status: 'done',
  notes: '',
};

export const DailyWorkLogPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [operatorName, setOperatorName] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  const fetchLogs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('operator_id', user.id)
      .eq('log_date', today)
      .order('created_at', { ascending: false });
    const list = (data || []) as WorkLog[];
    setLogs(list);

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
  }, [user?.id, today]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => setOperatorName(data?.full_name || user.email || ''));
    fetchLogs();
  }, [user?.id, fetchLogs]);

  const handlePhotos = (files?: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    setPhotoFiles(prev => [...prev, ...arr]);
    setPhotoPreviews(prev => [...prev, ...arr.map(f => URL.createObjectURL(f))]);
    if (cameraRef.current) cameraRef.current.value = '';
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const clearPhoto = () => {
    setPhotoFiles([]);
    setPhotoPreviews([]);
    if (cameraRef.current) cameraRef.current.value = '';
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    clearPhoto();
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!form.job_name.trim()) {
      toast({ title: 'File / Job Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const [i, file] of photoFiles.entries()) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('work-log-photos')
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (upErr) throw upErr;
        uploaded.push(path);
      }

      const now = new Date();
      const { error } = await supabase.from('work_logs').insert({
        operator_id: user.id,
        log_date: today,
        log_time: now.toTimeString().slice(0, 8),
        job_name: form.job_name.trim(),
        work_type: form.work_type || null,
        quantity: form.quantity ? Number(form.quantity) : null,
        price: form.price ? Number(form.price) : null,
        status: form.status,
        notes: form.notes.trim() || null,
        photo_path: uploaded[0] || null,
        photo_paths: uploaded,
      });
      if (error) throw error;

      toast({ title: 'Work log saved' });
      setOpen(false);
      resetForm();
      fetchLogs();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const totalValue = logs.reduce((s, l) => s + Number(l.price || 0), 0);
  const completed = logs.filter(l => l.status === 'done').length;
  const pending = logs.filter(l => l.status === 'pending').length;
  const inProgress = logs.filter(l => l.status === 'in_progress').length;

  const summary = [
    { title: "Today's Jobs", value: logs.length, icon: ListChecks },
    { title: 'Completed', value: completed, icon: CheckCircle2 },
    { title: 'Pending', value: pending, icon: Clock },
    { title: 'In Progress', value: inProgress, icon: Loader2 },
    { title: "Today's Total Value", value: `$${totalValue.toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {summary.map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium">{s.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-primary/40">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            Daily Work Log
            {logs.length > 0 && <Badge variant="secondary">{logs.length} today</Badge>}
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Work Log
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto custom-scrollbar">
          <h3 className="text-sm font-semibold mb-2">Today's Work Logs</h3>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No work recorded today. Click "Add Work Log" to record a completed job.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[80px]">Time</TableHead>
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
                    <TableCell>{l.log_time?.slice(0, 5)}</TableCell>
                    <TableCell className="font-medium">{l.job_name}</TableCell>
                    <TableCell>{l.work_type || '—'}</TableCell>
                    <TableCell>{l.quantity ?? '—'}</TableCell>
                    <TableCell>{l.price != null ? `$${Number(l.price).toFixed(2)}` : '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{statusLabel[l.status] || l.status}</Badge></TableCell>
                    <TableCell>
                      {l.photo_path && photoUrls[l.photo_path] ? (
                        <button type="button" onClick={() => setViewPhoto(photoUrls[l.photo_path!])}>
                          <img src={photoUrls[l.photo_path]} alt={`Proof for ${l.job_name}`} className="h-10 w-10 rounded object-cover border" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Work Log</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Operator Name</Label>
              <Input value={operatorName} readOnly className="bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Input value={today} readOnly className="bg-muted" />
              </div>
              <div className="grid gap-1.5">
                <Label>Time</Label>
                <Input value="Captured on save" readOnly className="bg-muted" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>File / Job Name *</Label>
              <Input value={form.job_name} onChange={e => setForm({ ...form, job_name: e.target.value })} placeholder="e.g. Banner - Hormuud" />
            </div>
            <div className="grid gap-1.5">
              <Label>Work Type</Label>
              <Select value={form.work_type} onValueChange={v => setForm({ ...form, work_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select work type" /></SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Price / Work Value</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes / Remarks</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>

            <div className="grid gap-2">
              <Label>Photo Proof</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Take Photo
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => uploadRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Upload Photo
                </Button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handlePhoto(e.target.files?.[0])} />
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={e => handlePhoto(e.target.files?.[0])} />
              {photoPreview && (
                <div className="relative w-fit">
                  <img src={photoPreview} alt="Work proof preview" className="h-32 rounded border object-cover" />
                  <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={clearPhoto}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {!photoPreview && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" /> No photo attached</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving} className="gap-2 w-full">
              <Check className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Work Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewPhoto} onOpenChange={(o) => !o && setViewPhoto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Photo Proof</DialogTitle></DialogHeader>
          {viewPhoto && <img src={viewPhoto} alt="Work log photo proof" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};