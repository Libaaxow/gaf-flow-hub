import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';

interface Entry {
  id: string;
  action: string;
  details: any;
  created_at: string;
  actor_id: string | null;
  actor_name?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  lead_created: 'Lead created',
  lead_converted: 'Converted to order',
  designer_assigned: 'Designer assigned',
  order_created: 'Order created',
  sent_to_production: 'Sent to production',
  production_started: 'Production started',
  production_completed: 'Marked completed',
  stage_changed: 'Stage changed',
};

export const ActivityTimeline = ({ entityType, entityId }: { entityType: 'lead' | 'order'; entityId: string }) => {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('id, action, details, created_at, actor_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
      if (cancelled || !data) return;
      const actorIds = Array.from(new Set(data.map((e: any) => e.actor_id).filter(Boolean)));
      let names: Record<string, string> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
        names = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
      }
      setEntries(data.map((e: any) => ({ ...e, actor_name: e.actor_id ? names[e.actor_id] : null })));
    })();

    const channel = supabase
      .channel(`activity-${entityType}-${entityId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `entity_id=eq.${entityId}` }, () => {
        supabase
          .from('activity_log')
          .select('id, action, details, created_at, actor_id')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .then(({ data }) => data && setEntries(data as any));
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [entityType, entityId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm font-medium">{ACTION_LABELS[e.action] || e.action}</p>
                <p className="text-xs text-muted-foreground">
                  {e.actor_name || 'System'} · {new Date(e.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityTimeline;