import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { generateClosingReportPDF } from '@/utils/generateClosingReportPDF';

const RESERVE_PERCENTAGE = 0.3;

export function ClosingReportCard() {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const [
        invoicesRes,
        paymentsRes,
        expensesRes,
        balancesRes,
        assetsRes,
        billsRes,
        liabilitiesRes,
        shRes,
        txRes,
      ] = await Promise.all([
        supabase
          .from('invoices')
          .select('invoice_number, invoice_date, due_date, total_amount, amount_paid, status, customers(name)')
          .eq('is_draft', false),
        supabase.from('payments').select('amount, payment_date, payment_method'),
        supabase.from('expenses').select('category, amount, expense_date').eq('approval_status', 'approved'),
        supabase.from('beginning_balances').select('amount'),
        supabase.from('company_assets').select('asset_name, quantity, unit_price, total_value, status'),
        supabase.from('vendor_bills').select('total_amount, amount_paid'),
        supabase.from('company_liabilities').select('title, vendor_name, amount, paid_amount, due_date, status'),
        supabase.from('shareholders').select('id, full_name, share_percentage').eq('status', 'active'),
        supabase.from('shareholder_transactions').select('shareholder_id, transaction_type, amount'),
      ]);

      const txs = txRes.data || [];
      const sumTx = (id: string, type: string) =>
        txs
          .filter((t: any) => t.shareholder_id === id && t.transaction_type === type)
          .reduce((s: number, t: any) => s + (t.amount || 0), 0);

      generateClosingReportPDF({
        periodLabel: `All records as of ${format(new Date(), 'MMMM dd, yyyy')}`,
        openingBalance: (balancesRes.data || []).reduce((s: number, b: any) => s + (b.amount || 0), 0),
        invoices: (invoicesRes.data || []).map((i: any) => ({
          invoice_number: i.invoice_number,
          invoice_date: i.invoice_date,
          due_date: i.due_date,
          total_amount: i.total_amount || 0,
          amount_paid: i.amount_paid || 0,
          status: i.status,
          customer_name: i.customers?.name || 'Unknown',
        })),
        payments: (paymentsRes.data || []) as any,
        expenses: (expensesRes.data || []) as any,
        assets: (assetsRes.data || []) as any,
        liabilities: (liabilitiesRes.data || []) as any,
        vendorBillsDue: (billsRes.data || []).reduce(
          (s: number, b: any) => s + Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0)),
          0,
        ),
        shareholders: (shRes.data || []).map((sh: any) => ({
          id: sh.id,
          full_name: sh.full_name,
          share_percentage: sh.share_percentage || 0,
          capital_invested: sumTx(sh.id, 'capital_investment'),
          withdrawals: sumTx(sh.id, 'withdrawal'),
          profit_share: sumTx(sh.id, 'profit_share'),
          outstanding_loan: Math.max(0, sumTx(sh.id, 'debt_taken') - sumTx(sh.id, 'debt_repayment')),
        })),
        reservePercentage: RESERVE_PERCENTAGE,
      });

      toast.success('Closing report downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Full Closing Report</h3>
            <p className="text-xs text-muted-foreground">
              Cash, income, expenses, receivables, assets, liabilities and a separate signed statement page for every
              shareholder.
            </p>
          </div>
        </div>
        <Button onClick={handleDownload} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Download Report
        </Button>
      </CardContent>
    </Card>
  );
}
