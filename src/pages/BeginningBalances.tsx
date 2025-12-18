import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, Building2, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface BeginningBalance {
  id: string;
  account_type: string;
  amount: number;
  notes: string | null;
  effective_date: string;
  created_at: string;
}

const BeginningBalances = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balances, setBalances] = useState<BeginningBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState<BeginningBalance | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    try {
      const { data, error } = await supabase
        .from('beginning_balances')
        .select('*')
        .order('effective_date', { ascending: false });

      if (error) throw error;
      setBalances(data || []);
    } catch (error: any) {
      console.error('Error fetching balances:', error);
      toast({
        title: 'Error',
        description: 'Failed to load beginning balances',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAccountType('cash');
    setAmount('');
    setNotes('');
    setEffectiveDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingBalance(null);
  };

  const openEditDialog = (balance: BeginningBalance) => {
    setEditingBalance(balance);
    setAccountType(balance.account_type as 'cash' | 'bank');
    setAmount(balance.amount.toString());
    setNotes(balance.notes || '');
    setEffectiveDate(balance.effective_date);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) < 0) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingBalance) {
        const { error } = await supabase
          .from('beginning_balances')
          .update({
            account_type: accountType,
            amount: parseFloat(amount),
            notes: notes || null,
            effective_date: effectiveDate,
          })
          .eq('id', editingBalance.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Beginning balance updated' });
      } else {
        const { error } = await supabase
          .from('beginning_balances')
          .insert({
            account_type: accountType,
            amount: parseFloat(amount),
            notes: notes || null,
            effective_date: effectiveDate,
            created_by: user?.id,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Beginning balance added' });
      }

      setDialogOpen(false);
      resetForm();
      fetchBalances();
    } catch (error: any) {
      console.error('Error saving balance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save beginning balance',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this beginning balance?')) return;

    try {
      const { error } = await supabase
        .from('beginning_balances')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Beginning balance deleted' });
      fetchBalances();
    } catch (error: any) {
      console.error('Error deleting balance:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete beginning balance',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Calculate totals
  const cashTotal = balances
    .filter(b => b.account_type === 'cash')
    .reduce((sum, b) => sum + b.amount, 0);
  const bankTotal = balances
    .filter(b => b.account_type === 'bank')
    .reduce((sum, b) => sum + b.amount, 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Beginning Balances</h1>
          <p className="text-muted-foreground">Set your opening cash and bank balances</p>
        </div>
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Balance</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(cashTotal)}</div>
              <p className="text-xs text-muted-foreground">Opening cash on hand</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCurrency(bankTotal)}</div>
              <p className="text-xs text-muted-foreground">Opening bank balance</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Opening Balance</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(cashTotal + bankTotal)}</div>
              <p className="text-xs text-muted-foreground">Combined opening funds</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Beginning Balances</CardTitle>
              <CardDescription>
                Enter your opening balances for cash and bank accounts
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Balance
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingBalance ? 'Edit Beginning Balance' : 'Add Beginning Balance'}
                  </DialogTitle>
                  <DialogDescription>
                    Enter the opening balance for your account
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select value={accountType} onValueChange={(v) => setAccountType(v as 'cash' | 'bank')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-4 w-4" />
                            Cash
                          </div>
                        </SelectItem>
                        <SelectItem value="bank">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Bank
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Effective Date</Label>
                    <Input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this balance"
                      rows={3}
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingBalance ? 'Update' : 'Add'} Balance
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          
          <CardContent>
            {balances.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Banknote className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No beginning balances set</p>
                <p className="text-sm">Add your opening cash and bank balances to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((balance) => (
                    <TableRow key={balance.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {balance.account_type === 'cash' ? (
                            <Banknote className="h-4 w-4 text-green-600" />
                          ) : (
                            <Building2 className="h-4 w-4 text-blue-600" />
                          )}
                          <span className="capitalize">{balance.account_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(balance.amount)}
                      </TableCell>
                      <TableCell>
                        {format(new Date(balance.effective_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {balance.notes || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(balance)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(balance.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default BeginningBalances;
