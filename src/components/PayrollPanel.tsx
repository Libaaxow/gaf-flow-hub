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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Plus, FileDown, Users } from 'lucide-react';
import { format } from 'date-fns';
import { generatePayslipPDF } from '@/utils/generatePayslipPDF';

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  monthly_salary?: number;
  status?: string;
}


interface PayrollRow {
  id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  gross_amount: number;
  allowances: number;
  deductions: number;
  net_amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  paid_at: string;
  processed_by: string | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Wallet' },
];

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyForm = () => ({
  employee_id: '',
  period_month: String(new Date().getMonth() + 1),
  period_year: String(new Date().getFullYear()),
  gross_amount: '',
  allowances: '',
  deductions: '',
  payment_method: 'cash',
  reference_number: '',
  notes: '',
});

export function PayrollPanel({ refreshKey, onPaid }: { refreshKey?: number; onPaid?: () => void } = {}) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [ledgerEmployee, setLedgerEmployee] = useState<string>('all');

  const [profileNames, setProfileNames] = useState<Employee[]>([]);

  const nameOf = (id: string | null) =>
    employees.find((e) => e.id === id)?.full_name ||
    profileNames.find((p) => p.id === id)?.full_name ||
    '—';

  const salaryOf = (id: string) => Number(employees.find((e) => e.id === id)?.monthly_salary || 0);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: emps }, { data: profs }, { data: pays }] = await Promise.all([
      supabase.from('employees').select('id, full_name, email, monthly_salary, status').order('full_name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('payroll_payments').select('*').order('paid_at', { ascending: false }),
    ]);
    setEmployees((emps as Employee[]) || []);
    setProfileNames((profs as Employee[]) || []);
    setRows((pays as PayrollRow[]) || []);
    setLoading(false);
  };


  useEffect(() => {
    fetchAll();
  }, []);

  const gross = Number(form.gross_amount) || 0;
  const allowances = Number(form.allowances) || 0;
  const deductions = Number(form.deductions) || 0;
  const net = Math.max(0, gross + allowances - deductions);

  const periodLabelOf = (r: PayrollRow) => `${MONTHS[r.period_month - 1]} ${r.period_year}`;

  const filtered = useMemo(
    () => (ledgerEmployee === 'all' ? rows : rows.filter((r) => r.employee_id === ledgerEmployee)),
    [rows, ledgerEmployee],
  );

  const totals = useMemo(
    () => ({
      net: filtered.reduce((s, r) => s + Number(r.net_amount), 0),
      deductions: filtered.reduce((s, r) => s + Number(r.deductions), 0),
      count: filtered.length,
    }),
    [filtered],
  );

  const submit = async () => {
    if (!form.employee_id) {
      toast({ title: 'Select an employee', variant: 'destructive' });
      return;
    }
    if (gross + allowances <= 0) {
      toast({ title: 'Enter a salary amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const employeeName = nameOf(form.employee_id);
      const periodLabel = `${MONTHS[Number(form.period_month) - 1]} ${form.period_year}`;

      // Cash actually leaving the company = net payable -> recorded as an approved expense
      const { data: expense, error: expErr } = await supabase
        .from('expenses')
        .insert({
          expense_date: new Date().toISOString().slice(0, 10),
          category: 'Salaries & Wages',
          description: `Salary payment — ${employeeName} (${periodLabel})`,
          amount: net,
          payment_method: form.payment_method as any,
          notes: form.notes || null,
          recorded_by: uid,
          approval_status: 'approved',
        })
        .select()
        .single();
      if (expErr) throw expErr;

      const { data: payroll, error } = await supabase
        .from('payroll_payments')
        .insert({
          employee_id: form.employee_id,
          period_month: Number(form.period_month),
          period_year: Number(form.period_year),
          gross_amount: gross,
          allowances,
          deductions,
          net_amount: net,
          payment_method: form.payment_method,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
          processed_by: uid,
          expense_id: expense.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Double-entry journal lines
      const lines = [
        { account: 'Salaries & Wages Expense', debit: gross + allowances, credit: 0, memo: `${employeeName} — ${periodLabel}` },
        { account: 'Cash / Bank Disbursement', debit: 0, credit: net, memo: form.payment_method },
      ];
      if (deductions > 0) {
        lines.push({ account: 'Employee Loan / Advance Receivable', debit: 0, credit: deductions, memo: 'Advance recovery' });
      }
      await supabase
        .from('payroll_journal_entries')
        .insert(lines.map((l) => ({ ...l, payroll_id: payroll.id })));

      // Audit trail
      await supabase.from('activity_log').insert({
        entity_type: 'payroll',
        entity_id: payroll.id,
        actor_id: uid,
        action: 'salary_paid',
        details: {
          employee: employeeName,
          period: periodLabel,
          net_salary_paid: net,
          deductions_applied: deductions,
          gross: gross,
          allowances,
          payment_method: form.payment_method,
        },
      });

      toast({ title: 'Salary paid', description: `${employeeName} — ${money(net)} for ${periodLabel}` });
      setOpen(false);
      setForm(emptyForm());
      fetchAll();
    } catch (e: any) {
      toast({ title: 'Could not process salary', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const downloadSlip = (r: PayrollRow) => {
    const emp = employees.find((e) => e.id === r.employee_id);
    generatePayslipPDF({
      employeeName: emp?.full_name || 'Employee',
      employeeEmail: emp?.email,
      periodLabel: periodLabelOf(r),
      grossAmount: Number(r.gross_amount),
      allowances: Number(r.allowances),
      deductions: Number(r.deductions),
      netAmount: Number(r.net_amount),
      paymentMethod: r.payment_method,
      reference: r.reference_number,
      paidAt: r.paid_at,
      processedBy: nameOf(r.processed_by),
      notes: r.notes,
    });
  };

  return (
    <Card className="w-full min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Wallet className="h-4 w-4" /> Payroll &amp; Salary Payments
        </CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Process Salary
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Net Paid</p>
            <p className="text-lg font-bold text-primary">{money(totals.net)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Deductions Recovered</p>
            <p className="text-lg font-bold">{money(totals.deductions)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Payments</p>
            <p className="text-lg font-bold">{totals.count}</p>
          </div>
        </div>

        <Tabs defaultValue="ledger" className="w-full">
          <TabsList>
            <TabsTrigger value="ledger" className="text-xs sm:text-sm">Payroll Ledger</TabsTrigger>
            <TabsTrigger value="summary" className="text-xs sm:text-sm">Per Employee</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Employee</Label>
              <Select value={ledgerEmployee} onValueChange={setLedgerEmployee}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Allowances</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Paid</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No salary payments recorded yet.</TableCell></TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(r.paid_at), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{nameOf(r.employee_id)}</TableCell>
                        <TableCell className="whitespace-nowrap">{periodLabelOf(r)}</TableCell>
                        <TableCell className="text-right">{money(r.gross_amount)}</TableCell>
                        <TableCell className="text-right">{money(r.allowances)}</TableCell>
                        <TableCell className="text-right text-destructive">{money(r.deductions)}</TableCell>
                        <TableCell className="text-right font-semibold">{money(r.net_amount)}</TableCell>
                        <TableCell><Badge variant="secondary">{r.payment_method.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => downloadSlip(r)}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="summary">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Total Net Paid</TableHead>
                    <TableHead className="text-right">Total Deductions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees
                    .map((e) => ({ e, list: rows.filter((r) => r.employee_id === e.id) }))
                    .filter((x) => x.list.length > 0)
                    .map(({ e, list }) => (
                      <TableRow key={e.id}>
                        <TableCell className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" />{e.full_name}</TableCell>
                        <TableCell className="text-right">{list.length}</TableCell>
                        <TableCell className="text-right font-semibold">{money(list.reduce((s, r) => s + Number(r.net_amount), 0))}</TableCell>
                        <TableCell className="text-right">{money(list.reduce((s, r) => s + Number(r.deductions), 0))}</TableCell>
                      </TableRow>
                    ))}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No payroll history yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Process Salary Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee *</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => {
                  const salary = salaryOf(v);
                  setForm({
                    ...form,
                    employee_id: v,
                    gross_amount: salary > 0 ? String(salary) : form.gross_amount,
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.filter((e) => e.status !== 'inactive').length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No employees recorded yet</div>
                  ) : (
                    employees
                      .filter((e) => e.status !== 'inactive')
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>

            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pay Month</Label>
                <Select value={form.period_month} onValueChange={(v) => setForm({ ...form, period_month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pay Year</Label>
                <Input type="number" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gross Salary ($)</Label>
                <Input type="number" step="0.01" value={form.gross_amount} onChange={(e) => setForm({ ...form, gross_amount: e.target.value })} />
              </div>
              <div>
                <Label>Allowances / Bonuses ($)</Label>
                <Input type="number" step="0.01" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Deductions / Salary Advances ($)</Label>
              <Input type="number" step="0.01" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Net Payable Amount</p>
              <p className="text-xl font-bold text-primary">{money(net)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference (optional)</Label>
                <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <p className="font-semibold">Journal entry preview</p>
              <p>Debit — Salaries &amp; Wages Expense: {money(gross + allowances)}</p>
              <p>Credit — Cash / Bank Disbursement: {money(net)}</p>
              <p>Credit — Employee Loan / Advance Receivable: {money(deductions)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Processing…' : 'Pay Salary'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
