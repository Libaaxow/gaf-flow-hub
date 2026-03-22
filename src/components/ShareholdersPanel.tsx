import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';

interface Shareholder {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  share_percentage: number;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ShareholderTransaction {
  id: string;
  shareholder_id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  reference_number: string | null;
  transaction_date: string;
  created_at: string;
}

const TRANSACTION_TYPES = [
  { value: 'capital_investment', label: 'Capital Investment', color: 'bg-green-100 text-green-800' },
  { value: 'profit_share', label: 'Profit Share', color: 'bg-blue-100 text-blue-800' },
  { value: 'debt_taken', label: 'Debt Taken', color: 'bg-red-100 text-red-800' },
  { value: 'debt_repayment', label: 'Debt Repayment', color: 'bg-orange-100 text-orange-800' },
  { value: 'withdrawal', label: 'Withdrawal', color: 'bg-purple-100 text-purple-800' },
  { value: 'adjustment', label: 'Adjustment', color: 'bg-gray-100 text-gray-800' },
];

export function ShareholdersPanel() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [transactions, setTransactions] = useState<ShareholderTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Shareholder form
  const [shareholderDialogOpen, setShareholderDialogOpen] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState<Shareholder | null>(null);
  const [shName, setShName] = useState('');
  const [shPhone, setShPhone] = useState('');
  const [shEmail, setShEmail] = useState('');
  const [shPercentage, setShPercentage] = useState('');
  const [shNotes, setShNotes] = useState('');

  // Transaction form
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txShareholderId, setTxShareholderId] = useState('');
  const [txType, setTxType] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txReference, setTxReference] = useState('');
  const [txDate, setTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Selected shareholder for ledger view
  const [selectedShareholder, setSelectedShareholder] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [shRes, txRes] = await Promise.all([
      supabase.from('shareholders').select('*').order('full_name'),
      supabase.from('shareholder_transactions').select('*').order('transaction_date', { ascending: false }),
    ]);
    if (shRes.data) setShareholders(shRes.data as Shareholder[]);
    if (txRes.data) setTransactions(txRes.data as ShareholderTransaction[]);
    setLoading(false);
  };

  const getBalance = (shareholderId: string) => {
    const shTx = transactions.filter(t => t.shareholder_id === shareholderId);
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

  const getDebtBalance = (shareholderId: string) => {
    const shTx = transactions.filter(t => t.shareholder_id === shareholderId);
    let debt = 0;
    shTx.forEach(t => {
      if (t.transaction_type === 'debt_taken') debt += t.amount;
      if (t.transaction_type === 'debt_repayment') debt -= t.amount;
    });
    return Math.max(0, debt);
  };

  const resetShareholderForm = () => {
    setShName(''); setShPhone(''); setShEmail(''); setShPercentage(''); setShNotes('');
    setEditingShareholder(null);
    setShareholderDialogOpen(false);
  };

  const handleSaveShareholder = async () => {
    if (!shName.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    const data: any = {
      full_name: shName.trim(),
      phone: shPhone || null,
      email: shEmail || null,
      share_percentage: parseFloat(shPercentage) || 0,
      notes: shNotes || null,
    };
    if (editingShareholder) {
      const { error } = await supabase.from('shareholders').update(data).eq('id', editingShareholder.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Shareholder updated' });
    } else {
      data.created_by = user?.id;
      const { error } = await supabase.from('shareholders').insert(data);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Shareholder added' });
    }
    resetShareholderForm();
    fetchData();
  };

  const handleDeleteShareholder = async (id: string) => {
    if (!confirm('Delete this shareholder and all their transactions?')) return;
    const { error } = await supabase.from('shareholders').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Shareholder deleted' });
    if (selectedShareholder === id) setSelectedShareholder(null);
    fetchData();
  };

  const handleRecordTransaction = async () => {
    if (!txShareholderId || !txType || !txAmount || parseFloat(txAmount) <= 0) {
      toast({ title: 'Error', description: 'Fill in all required fields', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('shareholder_transactions').insert({
      shareholder_id: txShareholderId,
      transaction_type: txType as any,
      amount: parseFloat(txAmount),
      description: txDescription || null,
      reference_number: txReference || null,
      transaction_date: txDate,
      created_by: user?.id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Transaction recorded' });
    setTxDialogOpen(false);
    setTxShareholderId(''); setTxType(''); setTxAmount(''); setTxDescription(''); setTxReference('');
    setTxDate(format(new Date(), 'yyyy-MM-dd'));
    fetchData();
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    const { error } = await supabase.from('shareholder_transactions').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Transaction deleted' });
    fetchData();
  };

  const getTypeInfo = (type: string) => TRANSACTION_TYPES.find(t => t.value === type) || { label: type, color: 'bg-muted text-muted-foreground' };

  const filteredTransactions = selectedShareholder
    ? transactions.filter(t => t.shareholder_id === selectedShareholder)
    : transactions;

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setShareholderDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Shareholder
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setTxDialogOpen(true); if (selectedShareholder) setTxShareholderId(selectedShareholder); }}>
          <Wallet className="h-4 w-4 mr-1" /> Record Transaction
        </Button>
      </div>

      {/* Shareholders list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {shareholders.map(sh => {
          const balance = getBalance(sh.id);
          const debt = getDebtBalance(sh.id);
          const isSelected = selectedShareholder === sh.id;
          return (
            <Card
              key={sh.id}
              className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
              onClick={() => setSelectedShareholder(isSelected ? null : sh.id)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-sm">{sh.full_name}</h3>
                    {sh.phone && <p className="text-xs text-muted-foreground">{sh.phone}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => {
                      e.stopPropagation();
                      setEditingShareholder(sh);
                      setShName(sh.full_name);
                      setShPhone(sh.phone || '');
                      setShEmail(sh.email || '');
                      setShPercentage(String(sh.share_percentage));
                      setShNotes(sh.notes || '');
                      setShareholderDialogOpen(true);
                    }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteShareholder(sh.id);
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Share:</span>
                    <span className="ml-1 font-medium">{sh.share_percentage}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Balance:</span>
                    <span className={`ml-1 font-medium ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {balance.toLocaleString()}
                    </span>
                  </div>
                  {debt > 0 && (
                    <div>
                      <span className="text-muted-foreground">Debt:</span>
                      <span className="ml-1 font-medium text-red-600">{debt.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {shareholders.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8">No shareholders registered yet</p>
        )}
      </div>

      {/* Transactions ledger */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {selectedShareholder
              ? `Ledger - ${shareholders.find(s => s.id === selectedShareholder)?.full_name}`
              : 'All Transactions'}
            <span className="text-muted-foreground font-normal ml-2">({filteredTransactions.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {!selectedShareholder && <TableHead>Shareholder</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map(tx => {
                  const typeInfo = getTypeInfo(tx.transaction_type);
                  const isCredit = ['capital_investment', 'debt_repayment'].includes(tx.transaction_type);
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">{format(new Date(tx.transaction_date), 'dd/MM/yyyy')}</TableCell>
                      {!selectedShareholder && (
                        <TableCell className="text-xs">{shareholders.find(s => s.id === tx.shareholder_id)?.full_name}</TableCell>
                      )}
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{tx.description || '-'}</TableCell>
                      <TableCell className="text-xs">{tx.reference_number || '-'}</TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        <span className={`flex items-center justify-end gap-1 ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                          {isCredit ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {tx.amount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteTransaction(tx.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={selectedShareholder ? 6 : 7} className="text-center text-muted-foreground py-8">
                      No transactions recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Shareholder Dialog */}
      <Dialog open={shareholderDialogOpen} onOpenChange={(open) => { if (!open) resetShareholderForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShareholder ? 'Edit Shareholder' : 'Add Shareholder'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Full Name *</Label><Input value={shName} onChange={e => setShName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={shPhone} onChange={e => setShPhone(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={shEmail} onChange={e => setShEmail(e.target.value)} /></div>
            <div><Label>Share Percentage (%)</Label><Input type="number" value={shPercentage} onChange={e => setShPercentage(e.target.value)} min="0" max="100" step="0.01" /></div>
            <div><Label>Notes</Label><Input value={shNotes} onChange={e => setShNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetShareholderForm}>Cancel</Button>
            <Button onClick={handleSaveShareholder}>{editingShareholder ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Transaction Dialog */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Shareholder *</Label>
              <Select value={txShareholderId} onValueChange={setTxShareholderId}>
                <SelectTrigger><SelectValue placeholder="Select shareholder" /></SelectTrigger>
                <SelectContent>
                  {shareholders.map(sh => (
                    <SelectItem key={sh.id} value={sh.id}>{sh.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Type *</Label>
              <Select value={txType} onValueChange={setTxType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount *</Label><Input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} min="0" step="0.01" /></div>
            <div><Label>Date</Label><Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} /></div>
            <div><Label>Description</Label><Input value={txDescription} onChange={e => setTxDescription(e.target.value)} /></div>
            <div><Label>Reference Number</Label><Input value={txReference} onChange={e => setTxReference(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordTransaction}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
