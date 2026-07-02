import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, StickyNote } from 'lucide-react';

interface LeadNote {
  id: string;
  title: string;
  description: string | null;
  customer_id: string | null;
  owner_id: string;
  created_at: string;
  created_by_role: string | null;
}

export const FinanceNotesPanel = () => {
  const { toast } = useToast();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'sent_to_finance')
      .order('created_at', { ascending: false });
    const list = (data as any) || [];
    setNotes(list);

    const custIds = [...new Set(list.map((l: LeadNote) => l.customer_id).filter(Boolean))];
    if (custIds.length) {
      const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', custIds as string[]);
      const map: Record<string, any> = {};
      (cs || []).forEach((c: any) => { map[c.id] = c; });
      setCustomers(map);
    }
    const ownerIds = [...new Set(list.map((l: LeadNote) => l.owner_id).filter(Boolean))];
    if (ownerIds.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', ownerIds as string[]);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setOwners(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
    const ch = supabase
      .channel('finance-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchNotes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const markProcessed = async (id: string) => {
    const { error } = await supabase.from('leads').update({ status: 'processed' }).eq('id', id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Note marked as processed' });
    fetchNotes();
  };

  if (loading) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <StickyNote className="h-5 w-5 text-primary" />
          Notes from Sales & Design
          {notes.length > 0 && <Badge variant="secondary">{notes.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending notes. New requests from sales and designers will appear here as a reference for creating invoices.</p>
        ) : (
          <div className="grid gap-3">
            {notes.map(n => {
              const cust = n.customer_id ? customers[n.customer_id] : null;
              return (
                <div key={n.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      {n.created_by_role && <Badge variant="outline" className="text-xs">{n.created_by_role}</Badge>}
                    </div>
                    {n.description && <p className="text-sm text-muted-foreground mt-1">{n.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      {cust && <span>Customer: <span className="text-foreground">{cust.name}</span>{cust.phone ? ` · ${cust.phone}` : ''}</span>}
                      {owners[n.owner_id] && <span>By: <span className="text-foreground">{owners[n.owner_id]}</span></span>}
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => markProcessed(n.id)} className="gap-2 shrink-0">
                    <CheckCircle className="h-4 w-4" /> Mark Processed
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
