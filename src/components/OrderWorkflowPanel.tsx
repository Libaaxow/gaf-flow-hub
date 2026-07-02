import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Send, Play, CheckCircle2 } from 'lucide-react';

const STAGE_LABEL: Record<string, string> = {
  not_sent: 'Not Sent',
  sent_to_production: 'Sent to Production',
  in_production: 'In Production',
  completed: 'Completed',
};

interface Props {
  orderId: string;
  onChanged?: () => void;
}

export const OrderWorkflowPanel = ({ orderId, onChanged }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [role, setRole] = useState<string | null>(null);
  const [stage, setStage] = useState<string>('not_sent');
  const [designerId, setDesignerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
      supabase.from('orders').select('production_stage, designer_id').eq('id', orderId).maybeSingle(),
    ]);
    if (r?.role) setRole(r.role as string);
    if (o) {
      setStage((o as any).production_stage || 'not_sent');
      setDesignerId((o as any).designer_id || null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user?.id]);

  const update = async (next: string) => {
    setSaving(true);
    const { error } = await supabase.from('orders').update({ production_stage: next }).eq('id', orderId);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setStage(next);
    toast({ title: 'Updated', description: STAGE_LABEL[next] });
    onChanged?.();
  };

  const isDesigner = role === 'designer' && designerId === user?.id;
  const isProduction = role === 'print_operator';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Workflow</span>
          <Badge variant="secondary">{STAGE_LABEL[stage]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {isDesigner && stage === 'not_sent' && (
          <Button onClick={() => update('sent_to_production')} disabled={saving} className="gap-2">
            <Send className="h-4 w-4" /> Send to Production
          </Button>
        )}
        {isProduction && stage === 'sent_to_production' && (
          <Button onClick={() => update('in_production')} disabled={saving} className="gap-2">
            <Play className="h-4 w-4" /> Start Production
          </Button>
        )}
        {isProduction && stage === 'in_production' && (
          <Button onClick={() => update('completed')} disabled={saving} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Mark Completed
          </Button>
        )}
        {!isDesigner && !isProduction && (
          <p className="text-sm text-muted-foreground">View-only for your role.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderWorkflowPanel;