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
import { Plus, Send } from 'lucide-react';

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
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [jobSize, setJobSize] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [designerAssign, setDesignerAssign] = useState<string>('');

  const [sendingId, setSendingId] = useState<string | null>(null);

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
    if (!user) return;
    if (!customerName.trim() || !customerPhone.trim() || !jobSize.trim()) {
      return toast({ title: 'Missing info', description: 'Customer name, number and job size are required.', variant: 'destructive' });
    }

    // Find or create customer by phone
    let cid: string | null = null;
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', customerPhone.trim())
      .limit(1);
    if (existing && existing.length > 0) {
      cid = existing[0].id;
    } else {
      const { data: newCust, error: custErr } = await supabase
        .from('customers')
        .insert({ name: customerName.trim(), phone: customerPhone.trim(), created_by: user.id })
        .select('id')
        .single();
      if (custErr) return toast({ title: 'Error', description: custErr.message, variant: 'destructive' });
      cid = newCust.id;
    }

    const payload: any = {
      title: `${customerName.trim()} - ${jobSize.trim()}`,
      description: `Size: ${jobSize.trim()}`,
      source: null,
      customer_id: cid,
      owner_id: user.id,
      created_by_role: role,
      status: 'new',
      quantity: quantity ? Number(quantity) : null,
      amount: amount ? Number(amount) : null,
      assigned_designer_id:
        role === 'designer' ? user.id : (designerAssign || null),
    };
    const { error } = await supabase.from('leads').insert(payload);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Lead created' });
    setOpen(false);
    setCustomerName(''); setCustomerPhone(''); setJobSize(''); setQuantity(''); setAmount(''); setDesignerAssign('');
    fetchLeads(); fetchCustomers();
  };

  const handleSendToFinance = async (lead: Lead) => {
    setSendingId(lead.id);
    const { error } = await supabase
      .from('leads')
      .update({ status: 'sent_to_finance' })
      .eq('id', lead.id);
    setSendingId(null);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Sent to Finance', description: 'A note has been added to the Finance dashboard for invoicing.' });
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
                <div className="flex flex-col gap-3">
                  <div className="space-y-1"><Label>Customer Name *</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" /></div>
                  <div className="space-y-1"><Label>Customer Number *</Label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" /></div>
                  <div className="space-y-1"><Label>Job Size *</Label>
                    <Input value={jobSize} onChange={(e) => setJobSize(e.target.value)} placeholder="e.g. 2m x 3m, A4, 100 pcs" /></div>
                  <div className="space-y-1"><Label>Quantity</Label>
                    <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 10" /></div>
                  <div className="space-y-1"><Label>Amount</Label>
                    <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 150.00" /></div>
                  {role === 'sales' && (
                    <div className="space-y-1"><Label>Assign Designer (optional)</Label>
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
                      <Button
                        size="sm"
                        onClick={() => handleSendToFinance(lead)}
                        disabled={sendingId === lead.id}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {sendingId === lead.id ? 'Sending...' : 'Send to Finance'}
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
    </Layout>
  );
};

export default Leads;