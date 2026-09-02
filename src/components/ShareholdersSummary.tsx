import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateDividendDebtStatementPDF } from '@/utils/generateDividendDebtStatementPDF';
import { Users, Banknote, AlertCircle, Receipt, Package, Wallet, Landmark, PiggyBank, HandCoins, FileText } from 'lucide-react';

interface Shareholder {
  id: string;
  full_name: string;
  share_percentage: number;
}

interface Transaction {
  shareholder_id: string;
  transaction_type: string;
  amount: number;
}

interface Dividend {
  id: string;
  reference_no: string;
  declaration_date: string;
  payment_date: string | null;
  dividend_amount: number;
  dividend_per_share: number;
  status: string;
}

// Company reserve rate (configurable)
const RESERVE_PERCENTAGE = 0.30;

/**
 * variant:
 *  - 'full'  → Admin / Accountant: full operational payout + debt details
 *  - 'board' → Board / Shareholder: governance-only equity overview
 */
export function ShareholdersSummary({ variant = 'full' }: { variant?: 'full' | 'board' }) {
  const isBoard = variant === 'board';
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [fixedAssets, setFixedAssets] = useState(0);
  const [companyLiabilities, setCompanyLiabilities] = useState(0);
  const [authorizedShares, setAuthorizedShares] = useState(0);
  const [parValue, setParValue] = useState(1000);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    const fetchData = async () => {
      const [shRes, txRes, invoicesRes, paymentsRes, expensesRes, balancesRes, assetsRes, billsRes, liabilitiesRes] = await Promise.all([
        supabase.from('shareholders').select('id, full_name, share_percentage').eq('status', 'active'),
        supabase.from('shareholder_transactions').select('shareholder_id, transaction_type, amount'),
        supabase.from('invoices').select('total_amount, amount_paid, is_draft').eq('is_draft', false),
        supabase.from('payments').select('amount'),
        supabase.from('expenses').select('amount, approval_status').eq('approval_status', 'approved'),
        supabase.from('beginning_balances').select('amount, account_type'),
        supabase.from('company_assets').select('total_value'),
        supabase.from('vendor_bills').select('total_amount, amount_paid'),
        supabase.from('company_liabilities').select('amount, paid_amount'),
      ]);
      if (shRes.data) setShareholders(shRes.data as Shareholder[]);
      if (txRes.data) setTransactions(txRes.data as Transaction[]);

      // Officially declared dividends (governance record)
      const { data: divData } = await supabase
        .from('dividend_declarations')
        .select('id, reference_no, declaration_date, payment_date, dividend_amount, dividend_per_share, status')
        .order('declaration_date', { ascending: false })
        .limit(10);
      setDividends((divData as any as Dividend[]) || []);

      // Corporate share structure (authorized shares / par value)
      const { data: cs } = await supabase
        .from('corporate_settings')
        .select('authorized_shares, par_value')
        .limit(1)
        .maybeSingle();
      if (cs) {
        setAuthorizedShares(Number((cs as any).authorized_shares) || 0);
        setParValue(Number((cs as any).par_value) || 1000);
      }


      // Cash balance = opening balance + collected payments - approved expenses
      const openingBalance = (balancesRes.data || []).reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
      const collected = (paymentsRes.data || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const expenses = (expensesRes.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      setCashBalance(openingBalance + collected - expenses);

      // Total receivables = unpaid customer invoices (non-draft)
      const receivable = (invoicesRes.data || []).reduce((sum: number, inv: any) => {
        const outstanding = (inv.total_amount || 0) - (inv.amount_paid || 0);
        return sum + Math.max(0, outstanding);
      }, 0);
      setTotalReceivables(receivable);

      // Fixed assets
      const assetsTotal = (assetsRes.data || []).reduce((sum: number, a: any) => sum + (a.total_value || 0), 0);
      setFixedAssets(assetsTotal);

      // Company liabilities = unpaid vendor bills + outstanding company payables
      const billsDue = (billsRes.data || []).reduce((sum: number, b: any) => {
        return sum + Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0));
      }, 0);
      const payablesDue = (liabilitiesRes.data || []).reduce((sum: number, l: any) => {
        return sum + Math.max(0, (l.amount || 0) - (l.paid_amount || 0));
      }, 0);
      setCompanyLiabilities(billsDue + payablesDue);

      setLoading(false);
    };
    fetchData();
    const onUpdate = () => fetchData();
    window.addEventListener('liabilities-updated', onUpdate);
    return () => window.removeEventListener('liabilities-updated', onUpdate);
  }, []);



  if (loading || shareholders.length === 0) return null;

  // Per-shareholder outstanding loan (debt_taken - debt_repayment)
  const getOutstandingLoan = (id: string) => {
    const shTx = transactions.filter(t => t.shareholder_id === id);
    let debt = 0;
    shTx.forEach(t => {
      if (t.transaction_type === 'debt_taken') debt += t.amount;
      if (t.transaction_type === 'debt_repayment') debt -= t.amount;
    });
    return Math.max(0, debt);
  };

  const loans = shareholders.map(sh => ({ id: sh.id, loan: getOutstandingLoan(sh.id) }));
  const totalShareholderLoans = loans.reduce((sum, l) => sum + l.loan, 0);

  // A. Net Company Worth (balance sheet perspective)
  const totalAssets = cashBalance + totalReceivables + fixedAssets + totalShareholderLoans;
  const netCompanyWorth = totalAssets - companyLiabilities;

  // B. Cash distribution & settlement (payout perspective)
  const cashAfterPayables = Math.max(0, cashBalance - companyLiabilities);
  const companyReserve = cashAfterPayables * RESERVE_PERCENTAGE;
  const distributableCash = cashAfterPayables - companyReserve;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const issuedShares = parValue > 0 ? netCompanyWorth / parValue : 0;

  const handleStatement = () => {
    const rows = shareholders.map(sh => {
      const pct = sh.share_percentage / 100;
      const loan = getOutstandingLoan(sh.id);
      const gross = distributableCash * pct;
      return {
        name: sh.full_name,
        pct: sh.share_percentage,
        netWorthShare: netCompanyWorth * pct,
        gross,
        deduction: Math.min(loan, gross),
        net: Math.max(0, gross - loan),
        remaining: Math.max(0, loan - gross),
      };
    });
    generateDividendDebtStatementPDF({
      netCompanyWorth,
      cashBalance,
      totalReceivables,
      fixedAssets,
      companyLiabilities,
      companyReserve,
      distributableCash,
      reservePercentage: RESERVE_PERCENTAGE,
      shareholders: rows,
      dividends,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          {isBoard ? 'Equity & Ownership Overview' : 'Shareholders Overview'}
        </CardTitle>
        {!isBoard && (
          <Button size="sm" variant="outline" onClick={handleStatement} className="gap-2">
            <FileText className="h-4 w-4" />
            Dividend & Debt Statement
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cap table summary (board governance view) */}
        {isBoard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Authorized Shares</p>
              <p className="text-lg font-bold">{fmt(authorizedShares)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Issued Shares</p>
              <p className="text-lg font-bold">{fmt(issuedShares)}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Unissued Shares</p>
              <p className="text-lg font-bold">{fmt(Math.max(0, authorizedShares - issuedShares))}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Shareholders</p>
              <p className="text-lg font-bold">{shareholders.length}</p>
            </div>
          </div>
        )}

        {/* Company financial position */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Cash Balance</span>
            </div>
            <span className="text-lg font-bold text-green-600">${fmt(cashBalance)}</span>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Total Receivables</span>
            </div>
            <span className="text-lg font-bold text-orange-600">${fmt(totalReceivables)}</span>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Fixed Assets</span>
            </div>
            <span className="text-lg font-bold text-blue-600">${fmt(fixedAssets)}</span>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Company Liabilities</span>
            </div>
            <span className="text-lg font-bold text-red-600">${fmt(companyLiabilities)}</span>
          </div>
        </div>

        {/* Distribution summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border rounded-lg p-3 flex items-center justify-between">
            <span className="text-muted-foreground">Net Company Worth</span>
            <span className={`font-bold ${netCompanyWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmt(netCompanyWorth)}</span>
          </div>
          <div className="border rounded-lg p-3 flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1"><PiggyBank className="h-3.5 w-3.5" /> Reserve ({RESERVE_PERCENTAGE * 100}%)</span>
            <span className="font-bold">${fmt(companyReserve)}</span>
          </div>
          <div className="border rounded-lg p-3 flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1"><HandCoins className="h-3.5 w-3.5" /> Distributable Cash</span>
            <span className="font-bold text-primary">${fmt(distributableCash)}</span>
          </div>
        </div>

        {/* Per-shareholder cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shareholders.map(sh => {
            const pct = sh.share_percentage / 100;
            const outstandingLoan = getOutstandingLoan(sh.id);

            const netWorthShare = netCompanyWorth * pct;
            const grossCashShare = distributableCash * pct;

            let netCashPayout = 0;
            let remainingLoan = 0;
            if (grossCashShare >= outstandingLoan) {
              netCashPayout = grossCashShare - outstandingLoan;
              remainingLoan = 0;
            } else {
              netCashPayout = 0;
              remainingLoan = outstandingLoan - grossCashShare;
            }

            return (
              <div key={sh.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-sm">{sh.full_name}</h4>
                  <Badge variant="outline" className="text-xs">{sh.share_percentage}%</Badge>
                </div>

                {/* Net Cash Payout */}
                <div className="bg-green-50 rounded-lg p-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-green-700">Net Cash Payout</span>
                  <span className="text-sm font-bold text-green-700">${fmt(netCashPayout)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Company Net Worth Share */}
                  <div className="bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <Banknote className="h-3 w-3" />
                      <span>Net Worth Share</span>
                    </div>
                    <p className={`font-semibold text-sm ${netWorthShare >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${fmt(netWorthShare)}
                    </p>
                  </div>

                  {/* Gross Distributable Cash Share */}
                  <div className="bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <HandCoins className="h-3 w-3" />
                      <span>Gross Cash Share</span>
                    </div>
                    <p className="font-semibold text-sm text-primary">${fmt(grossCashShare)}</p>
                  </div>
                </div>

                {/* Loan deduction applied */}
                {outstandingLoan > 0 && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Loan Deduction: <strong>${fmt(Math.min(outstandingLoan, grossCashShare))}</strong></span>
                  </div>
                )}

                {/* Outstanding remaining debt */}
                {remainingLoan > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Remaining Debt: <strong>${fmt(remainingLoan)}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
