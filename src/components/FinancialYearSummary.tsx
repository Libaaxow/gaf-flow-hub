import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { FinancialYearSelector } from '@/components/FinancialYearSelector';
import { useFinancialYear } from '@/lib/financialYear';

interface Totals {
  revenue: number;
  collected: number;
  expenses: number;
  profit: number;
  openingBalance: number;
  outstanding: number;
  assetValue: number;
}

const empty: Totals = {
  revenue: 0,
  collected: 0,
  expenses: 0,
  profit: 0,
  openingBalance: 0,
  outstanding: 0,
  assetValue: 0,
};

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Year-end closing view: income figures reset with every financial year,
 * while receivables, carried cash and assets continue across years.
 */
export function FinancialYearSummary() {
  const { year, range, isCurrentYear } = useFinancialYear();
  const [totals, setTotals] = useState<Totals>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [invYear, invAll, payRes, expRes, balRes, assetRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('total_amount')
          .gte('invoice_date', range.start)
          .lt('invoice_date', range.endExclusive),
        supabase.from('invoices').select('total_amount, amount_paid, is_draft'),
        supabase.from('payments').select('amount, payment_date, is_contra'),
        supabase.from('expenses').select('amount, expense_date').eq('approval_status', 'approved'),
        supabase.from('beginning_balances').select('amount'),
        supabase.from('company_assets').select('total_value, status'),
      ]);
      if (cancelled) return;

      const cash = (payRes.data || []).filter((p: any) => !p.is_contra);
      const collected = cash
        .filter((p: any) => p.payment_date >= range.start && p.payment_date < range.endExclusive)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const collectedBefore = cash
        .filter((p: any) => p.payment_date < range.start)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      const expenses = (expRes.data || [])
        .filter((e: any) => e.expense_date >= range.start && e.expense_date < range.endExclusive)
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
      const expensesBefore = (expRes.data || [])
        .filter((e: any) => e.expense_date < range.start)
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      const initial = (balRes.data || []).reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
      const confirmed = (invAll.data || []).filter((i: any) => !i.is_draft);
      const outstanding = confirmed.reduce(
        (s: number, i: any) => s + (Number(i.total_amount || 0) - Number(i.amount_paid || 0)),
        0,
      );

      setTotals({
        revenue: (invYear.data || []).reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
        collected,
        expenses,
        profit: collected - expenses,
        openingBalance: initial + collectedBefore - expensesBefore,
        outstanding,
        assetValue: (assetRes.data || []).reduce((s: number, a: any) => s + Number(a.total_value || 0), 0),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, range.start, range.endExclusive]);

  const cards = [
    { label: `Revenue invoiced ${year}`, value: money(totals.revenue), color: 'text-blue-600' },
    { label: `Collected ${year}`, value: money(totals.collected), color: 'text-green-600' },
    { label: `Expenses ${year}`, value: money(totals.expenses), color: 'text-destructive' },
    {
      label: `Net profit ${year}`,
      value: money(totals.profit),
      color: totals.profit >= 0 ? 'text-green-600' : 'text-destructive',
    },
    { label: `Opening balance (carried into ${year})`, value: money(totals.openingBalance), color: 'text-indigo-600' },
    { label: 'Outstanding debt (carried forward)', value: money(totals.outstanding), color: 'text-orange-600' },
    { label: 'Assets & equipment (carried forward)', value: money(totals.assetValue), color: 'text-primary' },
  ];

  return (
    <Card className="min-w-0">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Financial Year Closing Summary</h3>
            <p className="text-xs text-muted-foreground">
              {range.label}
              {isCurrentYear ? ' — current year' : ' — archived year'}. Income starts from zero each year; debts, cash
              carried forward and assets continue.
            </p>
          </div>
          <FinancialYearSelector className="shrink-0" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border bg-background p-3 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{loading ? '—' : c.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
