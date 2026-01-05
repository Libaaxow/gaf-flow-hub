import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Wallet, ArrowDownToLine, History, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Commission {
  id: string;
  order_id: string;
  commission_amount: number;
  commission_percentage: number;
  commission_type: string;
  paid_status: string | null;
  created_at: string;
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  requested_at: string;
  processed_at: string | null;
  notes: string | null;
  payment_method: string | null;
  payment_reference: string | null;
}

export function CommissionPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalCommissions = commissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const paidCommissions = commissions
    .filter(c => c.paid_status === 'paid')
    .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const pendingCommissions = totalCommissions - paidCommissions;
  
  const pendingWithdrawals = withdrawalRequests
    .filter(w => w.status === 'pending' || w.status === 'approved')
    .reduce((sum, w) => sum + Number(w.amount || 0), 0);
  
  const availableForWithdrawal = pendingCommissions - pendingWithdrawals;

  useEffect(() => {
    if (user) {
      fetchData();
      
      const channel = supabase
        .channel('commission-panel-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, fetchData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_withdrawal_requests' }, fetchData)
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Fetch user's commissions
      const { data: commissionsData, error: commissionsError } = await supabase
        .from('commissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (commissionsError) throw commissionsError;
      setCommissions(commissionsData || []);

      // Fetch user's withdrawal requests
      const { data: withdrawalsData, error: withdrawalsError } = await supabase
        .from('commission_withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false });

      if (withdrawalsError) throw withdrawalsError;
      setWithdrawalRequests(withdrawalsData || []);

    } catch (error: any) {
      console.error('Error fetching commission data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalRequest = async () => {
    if (!user) return;
    
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount greater than 0',
        variant: 'destructive',
      });
      return;
    }

    if (amount > availableForWithdrawal) {
      toast({
        title: 'Insufficient Balance',
        description: `Maximum available for withdrawal: $${availableForWithdrawal.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const { error } = await supabase
        .from('commission_withdrawal_requests')
        .insert({
          user_id: user.id,
          amount: amount,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: 'Withdrawal Requested',
        description: `Your withdrawal request for $${amount.toFixed(2)} has been submitted`,
      });

      setIsWithdrawDialogOpen(false);
      setWithdrawAmount('');
      fetchData();

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-success/10 text-success border-success"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          My Commissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Commission Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Earned</p>
            <p className="text-lg font-bold text-foreground">${totalCommissions.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Paid Out</p>
            <p className="text-lg font-bold text-success">${paidCommissions.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Pending Withdrawal</p>
            <p className="text-lg font-bold text-warning">${pendingWithdrawals.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="text-lg font-bold text-primary">${availableForWithdrawal.toFixed(2)}</p>
          </div>
        </div>

        {/* Withdraw Button */}
        {availableForWithdrawal > 0 && (
          <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Request Withdrawal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Commission Withdrawal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground">Available for withdrawal</p>
                  <p className="text-2xl font-bold text-primary">${availableForWithdrawal.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Withdrawal Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableForWithdrawal}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsWithdrawDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleWithdrawalRequest} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Tabs for history */}
        <Tabs defaultValue="withdrawals" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="withdrawals" className="flex-1">
              <History className="h-4 w-4 mr-1" />
              Withdrawals
            </TabsTrigger>
            <TabsTrigger value="commissions" className="flex-1">
              <DollarSign className="h-4 w-4 mr-1" />
              Earnings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="withdrawals" className="mt-3">
            {withdrawalRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">No withdrawal requests yet</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawalRequests.slice(0, 5).map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="text-sm">
                          {format(new Date(request.requested_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-medium">${Number(request.amount).toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="commissions" className="mt-3">
            {commissions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">No commissions earned yet</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.slice(0, 5).map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell className="text-sm">
                          {format(new Date(commission.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="capitalize">{commission.commission_type}</TableCell>
                        <TableCell className="font-medium text-success">
                          +${Number(commission.commission_amount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
