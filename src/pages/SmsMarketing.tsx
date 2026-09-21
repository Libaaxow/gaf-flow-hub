import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sendSMS, SMSRecipient } from '@/utils/sendSMS';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Send, Users, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

type Audience = 'all_active' | 'framework' | 'inactive' | 'outstanding';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
}

const COST_PER_SEGMENT = 0.05;

const segmentsFor = (text: string) => {
  const unicode = /[^\x00-\x7F]/.test(text);
  const size = unicode ? 70 : 160;
  return Math.max(1, Math.ceil((text.length || 1) / size));
};

export default function SmsMarketing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [frameworkCustomerIds, setFrameworkCustomerIds] = useState<Set<string>>(new Set());
  const [lastPurchase, setLastPurchase] = useState<Record<string, string>>({});
  const [outstandingBy, setOutstandingBy] = useState<Record<string, number>>({});

  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('Hi {customer_name}, GAF MEDIA has a special offer for you this week. Call 0619130707. Mahadsanid.');
  const [audience, setAudience] = useState<Audience>('all_active');
  const [inactiveDays, setInactiveDays] = useState('30');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [testPhone, setTestPhone] = useState('+252');
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: cust }, { data: agreements }, { data: invoices }, { data: camps }] = await Promise.all([
        supabase.from('customers').select('id, name, phone').order('name'),
        supabase.from('customer_price_lists').select('customer_id, is_active').eq('is_active', true),
        supabase.from('invoices').select('customer_id, invoice_date, total_amount, amount_paid, is_draft').eq('is_draft', false),
        supabase.from('sms_campaigns').select('*').order('created_at', { ascending: false }).limit(25),
      ]);

      setCustomers((cust || []) as CustomerRow[]);
      setFrameworkCustomerIds(new Set((agreements || []).map((a: any) => a.customer_id)));

      const last: Record<string, string> = {};
      const out: Record<string, number> = {};
      for (const inv of invoices || []) {
        const cid = (inv as any).customer_id;
        if (!cid) continue;
        const d = (inv as any).invoice_date;
        if (d && (!last[cid] || d > last[cid])) last[cid] = d;
        const bal = Number((inv as any).total_amount || 0) - Number((inv as any).amount_paid || 0);
        if (bal > 0.01) out[cid] = (out[cid] || 0) + bal;
      }
      setLastPurchase(last);
      setOutstandingBy(out);
      setCampaigns(camps || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const audienceCustomers = useMemo(() => {
    const withPhone = customers.filter((c) => (c.phone || '').replace(/\D/g, '').length >= 9);
    if (audience === 'framework') return withPhone.filter((c) => frameworkCustomerIds.has(c.id));
    if (audience === 'outstanding') return withPhone.filter((c) => (outstandingBy[c.id] || 0) > 0.01);
    if (audience === 'inactive') {
      const days = Number(inactiveDays) || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return withPhone.filter((c) => !lastPurchase[c.id] || lastPurchase[c.id] < cutoffStr);
    }
    return withPhone;
  }, [customers, audience, inactiveDays, frameworkCustomerIds, lastPurchase, outstandingBy]);

  const recipients = audienceCustomers.filter((c) => !excluded.has(c.id));
  const segments = segmentsFor(message);
  const estimatedCost = recipients.length * segments * COST_PER_SEGMENT;

  const toggleExcluded = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSendTest = async () => {
    if (!testPhone || testPhone.replace(/\D/g, '').length < 9) {
      toast({ title: 'Enter a phone number', description: 'Use the format +252...', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const result = await sendSMS({
        to: testPhone,
        message: message.replace(/\{customer_name\}/gi, 'Test Customer'),
        messageType: 'test',
      });
      toast({
        title: result.sent ? 'Test SMS sent' : 'Test SMS failed',
        description: result.sent
          ? `Sent as "GAF MEDIA" to ${testPhone}.`
          : result.results?.[0]?.error || 'Twilio rejected the message.',
        variant: result.sent ? 'default' : 'destructive',
      });
    } catch (error: any) {
      toast({ title: 'Test SMS failed', description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!campaignName.trim()) {
      toast({ title: 'Campaign name required', description: 'Give this campaign a name.', variant: 'destructive' });
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Message required', description: 'Write the message to send.', variant: 'destructive' });
      return;
    }
    if (recipients.length === 0) {
      toast({ title: 'No recipients', description: 'No customers match this audience.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: campaign, error: campErr } = await supabase
        .from('sms_campaigns')
        .insert([{
          name: campaignName.trim(),
          message,
          audience,
          audience_days: audience === 'inactive' ? Number(inactiveDays) || 30 : null,
          total_recipients: recipients.length,
          estimated_cost: Number(estimatedCost.toFixed(4)),
          status: 'sending',
          created_by: user?.id,
        }])
        .select()
        .single();

      if (campErr) throw campErr;

      const list: SMSRecipient[] = recipients.map((c) => ({
        phone: c.phone as string,
        name: c.name,
        customerId: c.id,
      }));

      const result = await sendSMS({
        message,
        recipients: list,
        campaignId: campaign.id,
        messageType: 'marketing',
      });

      toast({
        title: 'Campaign finished',
        description: `Sent ${result.sent ?? 0} • Failed ${result.failed ?? 0} • Estimated cost $${Number(result.estimatedCost ?? 0).toFixed(2)}`,
      });
      setCampaignName('');
      setExcluded(new Set());
      fetchData();
    } catch (error: any) {
      toast({ title: 'Campaign failed', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 min-w-0">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-primary" />
            Marketing SMS
          </h1>
          <p className="text-muted-foreground">
            Send promotional messages to your customers. Messages show as <strong>GAF MEDIA</strong>.
          </p>
        </div>

        <Tabs defaultValue="compose">
          <TabsList>
            <TabsTrigger value="compose">Compose &amp; Send</TabsTrigger>
            <TabsTrigger value="history">Campaign Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Recipients
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{recipients.length}</p>
                  <p className="text-xs text-muted-foreground">Customers with a valid phone number</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Message parts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{segments}</p>
                  <p className="text-xs text-muted-foreground">{message.length} characters</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" /> Estimated cost
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">${estimatedCost.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">${COST_PER_SEGMENT.toFixed(2)} per message part</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sender name</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">GAF MEDIA</p>
                  <p className="text-xs text-muted-foreground">Twilio Messaging Service</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Campaign</CardTitle>
                <CardDescription>
                  Use <code>{'{customer_name}'}</code> and each customer sees their own name.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Campaign name</Label>
                    <Input
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. Ramadan banner offer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    <div className="flex gap-2">
                      <Select value={audience} onValueChange={(v) => { setAudience(v as Audience); setExcluded(new Set()); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_active">All active customers</SelectItem>
                          <SelectItem value="framework">Corporate / framework agreement clients</SelectItem>
                          <SelectItem value="inactive">Inactive clients (no purchase)</SelectItem>
                          <SelectItem value="outstanding">Customers with an unpaid balance</SelectItem>
                        </SelectContent>
                      </Select>
                      {audience === 'inactive' && (
                        <Select value={inactiveDays} onValueChange={setInactiveDays}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="60">60 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={1600}
                  />
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-2">
                    <Label>Send a test message to</Label>
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+252619130707"
                      className="w-56"
                    />
                  </div>
                  <Button variant="outline" onClick={handleSendTest} disabled={testing}>
                    {testing ? 'Sending...' : 'Send test SMS'}
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={handleSendCampaign} disabled={sending || recipients.length === 0}>
                    <Send className="mr-2 h-4 w-4" />
                    {sending ? 'Sending campaign...' : `Send to ${recipients.length} customers`}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recipient list</CardTitle>
                <CardDescription>Untick anyone you do not want to include.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {loading ? (
                  <p className="text-muted-foreground">Loading customers...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Send</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Last purchase</TableHead>
                        <TableHead className="text-right">Unpaid balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audienceCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No customers match this audience.
                          </TableCell>
                        </TableRow>
                      ) : (
                        audienceCustomers.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Checkbox checked={!excluded.has(c.id)} onCheckedChange={() => toggleExcluded(c.id)} />
                            </TableCell>
                            <TableCell className="font-medium">
                              {c.name}
                              {frameworkCustomerIds.has(c.id) && (
                                <Badge variant="outline" className="ml-2">Framework</Badge>
                              )}
                            </TableCell>
                            <TableCell>{c.phone}</TableCell>
                            <TableCell>
                              {lastPurchase[c.id]
                                ? format(new Date(lastPurchase[c.id]), 'dd MMM yyyy')
                                : <span className="text-muted-foreground">Never</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              ${(outstandingBy[c.id] || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Campaign reports</CardTitle>
                <CardDescription>Sent, failed and estimated cost per campaign.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Audience</TableHead>
                      <TableHead className="text-right">Recipients</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No campaigns sent yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      campaigns.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>{format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="capitalize">{String(c.audience).replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-right">{c.total_recipients}</TableCell>
                          <TableCell className="text-right text-green-600">{c.total_sent}</TableCell>
                          <TableCell className="text-right text-destructive">{c.total_failed}</TableCell>
                          <TableCell className="text-right">${Number(c.estimated_cost || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={c.total_failed > 0 ? 'destructive' : 'secondary'} className="gap-1">
                              {c.total_failed > 0 ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                              {c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
