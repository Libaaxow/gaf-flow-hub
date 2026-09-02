import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Coins } from 'lucide-react';
import { applyTestRole, useTestRole } from '@/lib/testRole';

/**
 * Home-screen popup that tells the Board there are resolutions to approve,
 * and tells Finance/Admin there are approved resolutions waiting to be executed.
 */
export const CorporateActionPopup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const testRole = useTestRole();
  const [actualRoles, setActualRoles] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string>('');

  const roles = applyTestRole(actualRoles, testRole);
  const isBoard = roles.includes('board');
  const isFinance = roles.includes('accountant') || roles.includes('admin');

  const wanted = isBoard ? 'pending_approval' : isFinance ? 'approved' : null;
  const pending = wanted ? requests.filter((r) => r.status === wanted) : [];

  const load = async () => {
    const { data } = await supabase
      .from('corporate_requests')
      .select('id, reference_no, title, status')
      .in('status', ['pending_approval', 'approved']);
    setRequests(data || []);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      setActualRoles((data || []).map((r: any) => r.role));
      await load();
    })();
    const channel = supabase
      .channel('corporate-action-popup')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'corporate_requests' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    const key = `${wanted || 'none'}:${pending.map((p) => p.id).join(',')}`;
    if (pending.length > 0 && key !== dismissed) setOpen(true);
    if (pending.length === 0) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, wanted]);

  if (!wanted || pending.length === 0) return null;

  const close = () => {
    setDismissed(`${wanted}:${pending.map((p) => p.id).join(',')}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBoard ? <ShieldCheck className="h-5 w-5 text-warning" /> : <Coins className="h-5 w-5 text-primary" />}
            {isBoard
              ? `Action Required: ${pending.length} Pending Corporate Request${pending.length > 1 ? 's' : ''}`
              : `Execution Required: ${pending.length} Board Approved Resolution${pending.length > 1 ? 's' : ''}`}
          </DialogTitle>
          <DialogDescription>
            {isBoard
              ? 'The Admin Manager has submitted corporate resolutions for your review and authorisation.'
              : 'The Board has authorised these resolutions. Execute them to post the ledger entries.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {pending.slice(0, 5).map((r) => (
            <div key={r.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{r.reference_no}</span>
                <Badge variant={isBoard ? 'secondary' : 'default'}>{isBoard ? 'Pending approval' : 'Approved'}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{r.title}</p>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>Later</Button>
          <Button onClick={() => { close(); navigate('/corporate'); }}>
            {isBoard ? 'Review Request' : 'Execute & Post Journal Entries'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
