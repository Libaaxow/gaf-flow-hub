import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, subDays, startOfDay } from 'date-fns';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Bar,
  Line,
  Cell,
} from 'recharts';
import { TrendingUp, FileText, Wallet } from 'lucide-react';

interface DayPoint {
  date: string;
  label: string;
  sales: number;
  collected: number;
  invoices: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  customer_name: string;
}

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DailySalesChart() {
  const [days, setDays] = useState<string>('1');
  const [rows, setRows] = useState<DayPoint[]>([]);
  const [invoiceList, setInvoiceList] = useState<InvoiceRow[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const span = parseInt(days, 10);
      const from = startOfDay(subDays(new Date(), span - 1));
      const fromISO = format(from, 'yyyy-MM-dd');

      const [invRes, payRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('invoice_date, total_amount, is_draft')
          .gte('invoice_date', fromISO),
        supabase
          .from('payments')
          .select('payment_date, amount')
          .gte('payment_date', from.toISOString()),
      ]);

      const buckets = new Map<string, DayPoint>();
      for (let i = 0; i < span; i++) {
        const d = subDays(new Date(), span - 1 - i);
        const key = format(d, 'yyyy-MM-dd');
        buckets.set(key, {
          date: key,
          label: format(d, span > 31 ? 'MMM d' : 'd MMM'),
          sales: 0,
          collected: 0,
          invoices: 0,
        });
      }

      (invRes.data || [])
        .filter((i: any) => i.is_draft !== true)
        .forEach((i: any) => {
          const b = buckets.get(i.invoice_date);
          if (b) {
            b.sales += Number(i.total_amount) || 0;
            b.invoices += 1;
          }
        });

      (payRes.data || []).forEach((p: any) => {
        const key = format(new Date(p.payment_date), 'yyyy-MM-dd');
        const b = buckets.get(key);
        if (b) b.collected += Number(p.amount) || 0;
      });

      setRows(Array.from(buckets.values()));
      setLoading(false);
    };
    load();
  }, [days]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          sales: acc.sales + r.sales,
          collected: acc.collected + r.collected,
          invoices: acc.invoices + r.invoices,
        }),
        { sales: 0, collected: 0, invoices: 0 },
      ),
    [rows],
  );

  const maxSales = useMemo(() => Math.max(1, ...rows.map((r) => r.sales)), [rows]);

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base sm:text-lg">Daily Sales, Invoices & Collections</CardTitle>
          <CardDescription>Maalin kasta: iibka, tirada invoices, iyo lacagta la ururiyay</CardDescription>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" /> Total Sales
            </div>
            <p className="text-lg sm:text-xl font-bold truncate">{fmt(totals.sales)}</p>
          </div>
          <div className="rounded-lg border p-3 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" /> Collected
            </div>
            <p className="text-lg sm:text-xl font-bold truncate">{fmt(totals.collected)}</p>
          </div>
          <div className="rounded-lg border p-3 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" /> Invoices
            </div>
            <p className="text-lg sm:text-xl font-bold truncate">{totals.invoices}</p>
          </div>
        </div>

        <div className="h-[280px] w-full min-w-0">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-md bg-muted" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  yAxisId="money"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <YAxis yAxisId="count" orientation="right" hide />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: any, name: any) =>
                    name === 'Invoices' ? [value, name] : [fmt(Number(value)), name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="money"
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#salesFill)"
                />
                <Bar yAxisId="money" dataKey="collected" name="Collected" radius={[4, 4, 0, 0]} barSize={14}>
                  {rows.map((r) => (
                    <Cell
                      key={r.date}
                      fill="hsl(var(--secondary))"
                      fillOpacity={0.35 + 0.65 * (r.sales / maxSales)}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="invoices"
                  name="Invoices"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 3"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
