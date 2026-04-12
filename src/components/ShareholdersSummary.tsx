import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Landmark, Banknote, AlertCircle } from 'lucide-react';

interface Shareholder {
  id: string;
  full_name: string;
  share_percentage: number;
  asset_value: number;
  asset_description: string | null;
}

interface Transaction {
  shareholder_id: string;
  transaction_type: string;
  amount: number;
}

export function ShareholdersSummary() {
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [netProfit, setNetProfit] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [shRes, txRes, , paymentsRes, expensesRes, balancesRes] = await Promise.all([
        supabase.from('shareholders').select('id, full_name, share_percentage, asset_value, asset_description').eq('status', 'active'),
        supabase.from('shareholder_transactions').select('shareholder_id, transaction_type, amount'),
        supabase.from('invoices').select('total_amount, amount_paid, is_draft').eq('is_draft', false),
        supabase.from('payments').select('amount'),
        supabase.from('expenses').select('amount, approval_status').eq('approval_status', 'approved'),
        supabase.from('beginning_balances').select('amount, account_type'),
      ]);
      if (shRes.data) setShareholders(shRes.data as Shareholder[]);
      if (txRes.data) setTransactions(txRes.data as Transaction[]);

      // Calculate net profit: Opening Balance + Collected - Expenses
      const openingBalance = (balancesRes.data || []).reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
      const collected = (paymentsRes.data || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const expenses = (expensesRes.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      setNetProfit(openingBalance + collected - expenses);

      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading || shareholders.length === 0) return null;

  const getDebtBalance = (id: string) => {
    const shTx = transactions.filter(t => t.shareholder_id === id);
    let debt = 0;
    shTx.forEach(t => {
      if (t.transaction_type === 'debt_taken') debt += t.amount;
      if (t.transaction_type === 'debt_repayment') debt -= t.amount;
    });
    return Math.max(0, debt);
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Shareholders Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shareholders.map(sh => {
            const profitShare = netProfit * (sh.share_percentage / 100);
            const debt = getDebtBalance(sh.id);
            const outstanding = debt;
            return (
              <div key={sh.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-sm">{sh.full_name}</h4>
                  <Badge variant="outline" className="text-xs">{sh.share_percentage}%</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Assets */}
                  <div className="bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <Landmark className="h-3 w-3" />
                      <span>Assets</span>
                    </div>
                    <p className="font-semibold text-sm">${fmt(sh.asset_value)}</p>
                    {sh.asset_description && (
                      <p className="text-muted-foreground truncate">{sh.asset_description}</p>
                    )}
                  </div>
                  
                  {/* Money (share of net profit) */}
                  <div className="bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <Banknote className="h-3 w-3" />
                      <span>Money (Net Profit)</span>
                    </div>
                    <p className={`font-semibold text-sm ${profitShare >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${fmt(profitShare)}
                    </p>
                  </div>
                </div>

                {outstanding > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Outstanding Debt: <strong>${fmt(outstanding)}</strong></span>
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
