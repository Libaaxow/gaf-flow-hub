import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Wallet, Plus, Edit, DollarSign, TrendingDown, TrendingUp, History, RefreshCw, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

interface WalletData {
  id: string;
  user_id: string;
  current_balance: number;
  monthly_salary: number;
  advance_balance: number;
  last_daily_credit_date: string | null;
  profiles: Profile;
}

interface WalletTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
  user_profile?: Profile;
}

type TransactionType = 'penalty' | 'advance' | 'bonus' | 'adjustment';

const WalletManagement = () => {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingDaily, setProcessingDaily] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Create wallet dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  
  // Edit wallet dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletData | null>(null);
  const [editMonthlySalary, setEditMonthlySalary] = useState('');
  
  // Transaction dialog
  const [txOpen, setTxOpen] = useState(false);
  const [txWallet, setTxWallet] = useState<WalletData | null>(null);
  const [txType, setTxType] = useState<TransactionType>('adjustment');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  
  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyWallet, setHistoryWallet] = useState<WalletData | null>(null);
  const [walletHistory, setWalletHistory] = useState<WalletTransaction[]>([]);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    fetchData();
    // Fetch user role
    if (user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setUserRole(data.role);
        });
    }
  }, [user]);

  const fetchData = async () => {
    try {
      // Fetch all wallets with user info
      const { data: walletsData, error: walletsError } = await supabase
        .from('user_wallets')
        .select('*, profiles!user_wallets_user_id_fkey(id, full_name, email)')
        .order('created_at', { ascending: false });

      if (walletsError) throw walletsError;
      setWallets((walletsData || []) as unknown as WalletData[]);

      // Fetch profiles without wallets for creation
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email');

      if (profilesError) throw profilesError;
      
      const walletsUserIds = (walletsData || []).map((w: any) => w.user_id);
      const availableProfiles = (profilesData || []).filter(p => !walletsUserIds.includes(p.id));
      setProfiles(availableProfiles);

      // Fetch recent transactions with user profile
      const { data: txData, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (txError) throw txError;
      
      // Get profiles for transactions
      const userIds = [...new Set((txData || []).map(t => t.user_id))];
      const { data: txProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      
      const profileMap = new Map((txProfiles || []).map(p => [p.id, p]));
      const txWithProfiles = (txData || []).map(tx => ({
        ...tx,
        user_profile: profileMap.get(tx.user_id)
      }));
      
      setTransactions(txWithProfiles as WalletTransaction[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWallet = async () => {
    if (!selectedUserId || !monthlySalary) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      const { error } = await supabase.from('user_wallets').insert({
        user_id: selectedUserId,
        monthly_salary: parseFloat(monthlySalary),
        current_balance: 0,
        advance_balance: 0
      });

      if (error) throw error;

      toast.success('Wallet created successfully');
      setCreateOpen(false);
      setSelectedUserId('');
      setMonthlySalary('');
      fetchData();
    } catch (error: any) {
      console.error('Error creating wallet:', error);
      toast.error(error.message || 'Failed to create wallet');
    }
  };

  const handleUpdateWallet = async () => {
    if (!editingWallet || !editMonthlySalary) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('user_wallets')
        .update({ monthly_salary: parseFloat(editMonthlySalary) })
        .eq('id', editingWallet.id);

      if (error) throw error;

      toast.success('Wallet updated successfully');
      setEditOpen(false);
      setEditingWallet(null);
      fetchData();
    } catch (error: any) {
      console.error('Error updating wallet:', error);
      toast.error(error.message || 'Failed to update wallet');
    }
  };

  const handleAddTransaction = async () => {
    if (!txWallet || !txAmount || !txType) {
      toast.error('Please fill all required fields');
      return;
    }

    const amount = parseFloat(txAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      // Determine if this is a deduction or addition
      const isDeduction = txType === 'penalty' || txType === 'advance';
      const txAmountValue = isDeduction ? -Math.abs(amount) : Math.abs(amount);

      // Insert transaction
      const { error: txError } = await supabase.from('wallet_transactions').insert({
        user_id: txWallet.user_id,
        amount: txAmountValue,
        transaction_type: txType,
        description: txDescription || null,
        created_by: user?.id
      });

      if (txError) throw txError;

      // Update wallet balance
      let updateData: any = {};
      
      if (txType === 'advance') {
        // Add to advance balance (to be deducted daily)
        updateData = {
          advance_balance: txWallet.advance_balance + Math.abs(amount),
          current_balance: txWallet.current_balance + Math.abs(amount) // Give the advance
        };
      } else if (txType === 'penalty') {
        updateData = { current_balance: txWallet.current_balance - Math.abs(amount) };
      } else {
        // bonus or adjustment - add to balance
        updateData = { current_balance: txWallet.current_balance + Math.abs(amount) };
      }

      const { error: updateError } = await supabase
        .from('user_wallets')
        .update(updateData)
        .eq('id', txWallet.id);

      if (updateError) throw updateError;

      toast.success('Transaction added successfully');
      setTxOpen(false);
      setTxWallet(null);
      setTxAmount('');
      setTxDescription('');
      fetchData();
    } catch (error: any) {
      console.error('Error adding transaction:', error);
      toast.error(error.message || 'Failed to add transaction');
    }
  };

  const handleProcessDailyCredits = async () => {
    setProcessingDaily(true);
    try {
      const { error } = await supabase.rpc('process_daily_salary_credits');
      if (error) throw error;
      toast.success('Daily credits processed successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error processing daily credits:', error);
      toast.error(error.message || 'Failed to process daily credits');
    } finally {
      setProcessingDaily(false);
    }
  };

  const openHistory = async (wallet: WalletData) => {
    setHistoryWallet(wallet);
    setHistoryOpen(true);
    
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', wallet.user_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      toast.error('Failed to load history');
      return;
    }
    setWalletHistory((data || []) as WalletTransaction[]);
  };

  const handleDeleteWallet = async (wallet: WalletData) => {
    try {
      // First delete all transactions for this wallet
      const { error: txError } = await supabase
        .from('wallet_transactions')
        .delete()
        .eq('user_id', wallet.user_id);

      if (txError) throw txError;

      // Then delete the wallet
      const { error: walletError } = await supabase
        .from('user_wallets')
        .delete()
        .eq('id', wallet.id);

      if (walletError) throw walletError;

      toast.success('Wallet and all transactions deleted successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting wallet:', error);
      toast.error(error.message || 'Failed to delete wallet');
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'daily_credit':
        return <Badge className="bg-green-500">Daily Credit</Badge>;
      case 'penalty':
        return <Badge variant="destructive">Penalty</Badge>;
      case 'advance':
        return <Badge className="bg-blue-500">Advance</Badge>;
      case 'advance_deduction':
        return <Badge className="bg-orange-500">Advance Deduction</Badge>;
      case 'bonus':
        return <Badge className="bg-purple-500">Bonus</Badge>;
      case 'adjustment':
        return <Badge variant="secondary">Adjustment</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Wallet Management</h1>
            <p className="text-muted-foreground">Manage user wallets, salaries, advances and penalties</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleProcessDailyCredits} disabled={processingDaily}>
              <RefreshCw className={`h-4 w-4 mr-2 ${processingDaily ? 'animate-spin' : ''}`} />
              Process Daily Credits
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create User Wallet</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select User</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user..." />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.full_name} ({profile.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Monthly Salary ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(e.target.value)}
                      placeholder="e.g. 300"
                    />
                    {monthlySalary && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Daily credit: ${(parseFloat(monthlySalary) / 30).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <Button onClick={handleCreateWallet} className="w-full">
                    Create Wallet
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Wallet className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Wallets</p>
                  <p className="text-2xl font-bold">{wallets.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Balance</p>
                  <p className="text-2xl font-bold">
                    ${wallets.reduce((sum, w) => sum + w.current_balance, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Salaries</p>
                  <p className="text-2xl font-bold">
                    ${wallets.reduce((sum, w) => sum + w.monthly_salary, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Pending Advances</p>
                  <p className="text-2xl font-bold">
                    ${wallets.reduce((sum, w) => sum + w.advance_balance, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Wallets Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Wallets</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Monthly Salary</TableHead>
                  <TableHead>Daily Credit</TableHead>
                  <TableHead>Current Balance</TableHead>
                  <TableHead>Advance Balance</TableHead>
                  <TableHead>Last Credit</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{wallet.profiles?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{wallet.profiles?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>${wallet.monthly_salary.toFixed(2)}</TableCell>
                    <TableCell>${(wallet.monthly_salary / 30).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">${wallet.current_balance.toFixed(2)}</TableCell>
                    <TableCell>
                      {wallet.advance_balance > 0 ? (
                        <span className="text-orange-500">${wallet.advance_balance.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">$0.00</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {wallet.last_daily_credit_date
                        ? format(new Date(wallet.last_daily_credit_date), 'PP')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingWallet(wallet);
                            setEditMonthlySalary(wallet.monthly_salary.toString());
                            setEditOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTxWallet(wallet);
                            setTxOpen(true);
                          }}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openHistory(wallet)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the wallet for {wallet.profiles?.full_name}? 
                                  This will permanently delete the wallet and all associated transaction history. 
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteWallet(wallet)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.user_profile?.full_name || 'Unknown'}</TableCell>
                    <TableCell>{getTransactionBadge(tx.transaction_type)}</TableCell>
                    <TableCell className={tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>{tx.description || '-'}</TableCell>
                    <TableCell>{format(new Date(tx.created_at), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Wallet Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Wallet - {editingWallet?.profiles?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Monthly Salary ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editMonthlySalary}
                  onChange={(e) => setEditMonthlySalary(e.target.value)}
                />
                {editMonthlySalary && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Daily credit: ${(parseFloat(editMonthlySalary) / 30).toFixed(2)}
                  </p>
                )}
              </div>
              <Button onClick={handleUpdateWallet} className="w-full">
                Update Wallet
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Transaction Dialog */}
        <Dialog open={txOpen} onOpenChange={setTxOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Transaction - {txWallet?.profiles?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Transaction Type</Label>
                <Select value={txType} onValueChange={(v) => setTxType(v as TransactionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bonus (Add)</SelectItem>
                    <SelectItem value="adjustment">Adjustment (Add)</SelectItem>
                    <SelectItem value="penalty">Penalty (Deduct)</SelectItem>
                    <SelectItem value="advance">Advance (Add now, deduct daily)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <Label>Description (Optional)</Label>
                <Textarea
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  placeholder="Reason for this transaction..."
                />
              </div>
              <Button onClick={handleAddTransaction} className="w-full">
                Add Transaction
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Transaction History - {historyWallet?.profiles?.full_name}</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {walletHistory.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{getTransactionBadge(tx.transaction_type)}</TableCell>
                    <TableCell className={tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>{tx.description || '-'}</TableCell>
                    <TableCell>{format(new Date(tx.created_at), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default WalletManagement;
