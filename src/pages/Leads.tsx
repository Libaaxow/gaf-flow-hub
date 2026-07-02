import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowRightCircle } from 'lucide-react';

interface Lead {
  id: string;
  title: string;
  description: string | null;
  status: string;
  source: string | null;
  customer_id: string | null;
  assigned_designer_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  owner_id: string;
}

const Leads = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [role, setRole] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [designers, setDesigners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [designerAssign, setDesignerAssign] = useState<string>('');

  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [convertValue, setConvertValue] = useState('');
  const [convertDesigner, setConvertDesigner] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (r?.role) setRole(r.role as string);
      await Promise.all([fetchLeads(), fetchCustomers(), fetchDesigners()]);
      setLoading(false);
    })();

    const ch = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    setLeads((data as any) || []);
  };
  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, name, phone, company_name').order('name');
    setCustomers(data || []);
  };
  const fetchDesigners = async () => {
    const { data } = await supabase.from('user_roles').select('user_id').eq('role', 'designer');
    const ids = (data || []).map((r: any) => r.user_id);
    if (!ids.length) return setDesigners([]);
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    setDesigners(profs || []);
  };

  const canCreate = role === 'sales' || role === 'designer';

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      source: source.trim() || null,
      customer_id: customerId || null,
      owner_id: user.id,
      created_by_role: role,
      status: 'new',
      assigned_designer_id:
        role === 'designer' ? user.id : (designerAssign || null),
    };
    const { error } = await supabase.from('leads').insert(payload);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Lead created' });
    setOpen(false);
    setTitle(''); setDescription(''); setSource(''); setCustomerId(''); setDesignerAssign('');
    fetchLeads();
  };

  const openConvert = (lead: Lead) => {
    setConvertLead(lead);
    setConvertValue('');
    setConvertDesigner(lead.assigned_designer_id || (role === 'designer' ? user!.id : ''));
  };

  const handleConvert = async () => {
    if (!convertLead || !user) return;
    if (!convertLead.customer_id) {
      return toast({ title: 'Missing customer', description: 'Attach a customer to this lead first.', variant: 'destructive' });
    }
    const designer = role === 'designer' ? user.id : convertDesigner;
    if (!designer) {
      return toast({ title: 'Designer required', description: 'Assign a designer before converting.', variant: 'destructive' });
    }
    const { data: order, error } = await supabase.from('orders').insert({
      customer_id: convertLead.customer_id,
      job_title: convertLead.title,
      description: convertLead.description || null,
      order_value: Number(convertValue) || 0,
      salesperson_id: role === 'sales' ? user.id : null,
      designer_id: designer,
      owner_id: user.id,
      production_stage: 'not_sent',
    } as any).select('id').single();
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await supabase.from('leads').update({ status: 'converted', converted_order_id: order.id }).eq('id', convertLead.id);
    toast({ title: 'Lead converted to order' });
    setConvertLead(null);
    fetchLeads();
  };

  if (loading) return <Layout><div className="p-8">Loading...</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
            <p className="text-muted-foreground">Capture leads and convert them into orders</p>
          </div>
          {canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Lead</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1"><Label>Title *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
                  <div className="space-y-1"><Label>Source</Label>
                    <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Walk-in, WhatsApp, referral..." /></div>
                  <div className="space-y-1"><Label>Customer</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger><SelectValue placeholder="Optional - link a customer" /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</SelectItem>)}</SelectContent>
                    </Select></div>
                  {role === 'sales' && (
                    <div className="space-y-1"><Label>Assign Designer (optional at lead stage)</Label>
                      <Select value={designerAssign} onValueChange={setDesignerAssign}>
                        <SelectTrigger><SelectValue placeholder="Pick a designer" /></SelectTrigger>
                        <SelectContent>{designers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}</SelectContent>
                      </Select></div>
                  )}
                  {role === 'designer' && (
                    <p className="text-xs text-muted-foreground">You will be auto-assigned as the designer.</p>
                  )}
                  <Button className="w-full" onClick={handleCreate}>Create Lead</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid gap-4">
          {leads.map(lead => {
            const cust = customers.find(c => c.id === lead.customer_id);
            return (
              <Card key={lead.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{lead.title}</CardTitle>
                    <Badge variant={lead.status === 'converted' ? 'default' : 'secondary'}>{lead.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {lead.description && <p className="text-muted-foreground">{lead.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    {cust && <span>Customer: <span className="text-foreground">{cust.name}</span></span>}
                    {lead.source && <span>Source: <span className="text-foreground">{lead.source}</span></span>}
                    <span>Created: <span className="text-foreground">{new Date(lead.created_at).toLocaleDateString()}</span></span>
                  </div>
                  {lead.status === 'new' && canCreate && lead.owner_id === user?.id && (
                    <div className="pt-2">
                      <Button size="sm" variant="outline" onClick={() => openConvert(lead)} className="gap-2">
                        <ArrowRightCircle className="h-4 w-4" /> Convert to Order
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {leads.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No leads yet</CardContent></Card>
          )}
        </div>
      </div>

      <Dialog open={!!convertLead} onOpenChange={(o) => !o && setConvertLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convert Lead to Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Order Value</Label>
              <Input type="number" step="0.01" value={convertValue} onChange={(e) => setConvertValue(e.target.value)} /></div>
            {role === 'sales' ? (
              <div className="space-y-1"><Label>Designer *</Label>
                <Select value={convertDesigner} onValueChange={setConvertDesigner}>
                  <SelectTrigger><SelectValue placeholder="Assign a designer" /></SelectTrigger>
                  <SelectContent>{designers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}</SelectContent>
                </Select></div>
            ) : (
              <p className="text-xs text-muted-foreground">You will be assigned as the designer.</p>
            )}
            <Button className="w-full" onClick={handleConvert}>Create Order</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Leads;