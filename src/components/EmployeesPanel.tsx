import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Pencil } from 'lucide-react';

export interface EmployeeRecord {
  id: string;
  full_name: string;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  monthly_salary: number;
  hire_date: string | null;
  status: string;
  notes: string | null;
  profile_id: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string;
}

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = () => ({
  id: '',
  full_name: '',
  job_title: '',
  department: '',
  phone: '',
  email: '',
  monthly_salary: '',
  hire_date: '',
  status: 'active',
  notes: '',
  profile_id: 'none',
});

export function EmployeesPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: emps }, { data: profs }] = await Promise.all([
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    setEmployees((emps as EmployeeRecord[]) || []);
    setProfiles((profs as ProfileOption[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const totals = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active');
    return {
      count: employees.length,
      active: active.length,
      payroll: active.reduce((s, e) => s + Number(e.monthly_salary || 0), 0),
    };
  }, [employees]);

  const openNew = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (e: EmployeeRecord) => {
    setForm({
      id: e.id,
      full_name: e.full_name,
      job_title: e.job_title || '',
      department: e.department || '',
      phone: e.phone || '',
      email: e.email || '',
      monthly_salary: e.monthly_salary ? String(e.monthly_salary) : '',
      hire_date: e.hire_date || '',
      status: e.status,
      notes: e.notes || '',
      profile_id: e.profile_id || 'none',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) {
      toast({ title: 'Employee name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        full_name: form.full_name.trim(),
        job_title: form.job_title.trim() || null,
        department: form.department.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        monthly_salary: Number(form.monthly_salary) || 0,
        hire_date: form.hire_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        profile_id: form.profile_id === 'none' ? null : form.profile_id,
      };

      if (form.id) {
        const { error } = await supabase.from('employees').update(payload).eq('id', form.id);
        if (error) throw error;
        toast({ title: 'Employee updated' });
      } else {
        const { error } = await supabase
          .from('employees')
          .insert({ ...payload, created_by: auth?.user?.id ?? null });
        if (error) throw error;
        toast({ title: 'Employee added' });
      }
      setOpen(false);
      await fetchAll();
      onChanged?.();
    } catch (err) {
      toast({
        title: 'Could not save employee',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Users className="h-4 w-4" /> Employees
        </CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Employees</p>
            <p className="text-lg font-bold">{totals.count}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-lg font-bold">{totals.active}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Monthly Salary Cost</p>
            <p className="text-lg font-bold text-primary">{money(totals.payroll)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Monthly Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : employees.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No employees recorded yet</TableCell></TableRow>
              ) : (
                employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.full_name}</TableCell>
                    <TableCell>{e.job_title || '—'}</TableCell>
                    <TableCell>{e.department || '—'}</TableCell>
                    <TableCell>{e.phone || '—'}</TableCell>
                    <TableCell className="text-right">{money(Number(e.monthly_salary))}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === 'active' ? 'default' : 'secondary'}>{e.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Job Title</Label>
                <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monthly Salary ($)</Label>
                <Input type="number" step="0.01" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} />
              </div>
              <div>
                <Label>Hire Date</Label>
                <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link to System User</Label>
                <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Employee'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
