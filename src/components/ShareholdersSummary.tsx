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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [shRes, txRes] = await Promise.all([
        supabase.from('shareholders').select('id, full_name, share_percentage, asset_value, asset_description').eq('status', 'active'),
        supabase.from('shareholder_transactions').select('shareholder_id, transaction_type, amount'),
      ]);
      if (shRes.data) setShareholders(shRes.data as Shareholder[]);
      if (txRes.data) setTransactions(txRes.data as Transaction[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading || shareholders.length === 0) return null;

  const getMoneyBalance = (id: string) => {
    const shTx = transactions.filter(t => t.shareholder_id === id);
    let balance = 0;
    shTx.forEach(t => {
      if (['capital_investment', 'debt_repayment'].includes(t.transaction_type)) {
        balance += t.amount;
      } else {
        balance -= t.amount;
      }
    });
    return balance;
  };

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
            const moneyBalance = getMoneyBalance(sh.id);
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
                  
                  {/* Money */}
                  <div className="bg-muted/50 rounded p-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <Banknote className="h-3 w-3" />
                      <span>Money</span>
                    </div>
                    <p className={`font-semibold text-sm ${moneyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${fmt(moneyBalance)}
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
