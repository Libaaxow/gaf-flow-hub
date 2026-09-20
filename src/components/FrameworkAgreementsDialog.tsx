import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, FileSignature } from 'lucide-react';
import { format } from 'date-fns';

interface Agreement {
  id: string;
  agreement_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  notes: string | null;
}

interface ContractPrice {
  id: string;
  product_id: string;
  custom_price: number;
  width: number | null;
  height: number | null;
  total_price: number | null;
}

interface ProductOption {
  id: string;
  name: string;
  sale_type: string;
  retail_unit: string | null;
  selling_price: number | null;
  selling_price_per_m2: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  canEdit: boolean;
}

const today = () => format(new Date(), 'yyyy-MM-dd');
const inOneYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return format(d, 'yyyy-MM-dd');
};

export const standardPriceOf = (p: ProductOption) =>
  p.sale_type === 'area' ? Number(p.selling_price_per_m2 || 0) : Number(p.selling_price || 0);

export const priceUnitOf = (p: ProductOption) =>
  p.sale_type === 'area' ? '/m²' : `/${p.retail_unit || 'piece'}`;

export const FrameworkAgreementsDialog = ({ open, onOpenChange, customerId, customerName, canEdit }: Props) => {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedAgreement, setSelectedAgreement] = useState<string | null>(null);
  const [prices, setPrices] = useState<ContractPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ agreement_name: '', start_date: today(), end_date: inOneYear(), notes: '' });
  const [newPrice, setNewPrice] = useState({ product_id: '', custom_price: '', width: '', height: '' });

  const loadPrices = useCallback(async (agreementId: string) => {
    const { data } = await supabase
      .from('contract_product_prices')
      .select('id, product_id, custom_price, width, height, total_price')
      .eq('agreement_id', agreementId)
      .order('created_at', { ascending: true });
    setPrices((data as ContractPrice[]) || []);
  }, []);

  const loadAgreements = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    const [{ data: ags }, { data: prods }] = await Promise.all([
      supabase
        .from('customer_price_lists')
        .select('id, agreement_name, start_date, end_date, is_active, notes')
        .eq('customer_id', customerId)
        .order('start_date', { ascending: false }),
      supabase
        .from('products')
        .select('id, name, sale_type, retail_unit, selling_price, selling_price_per_m2')
        .eq('status', 'active')
        .order('name'),
    ]);
    const list = (ags as Agreement[]) || [];
    setAgreements(list);
    setProducts((prods as ProductOption[]) || []);
    const first = list[0]?.id || null;
    setSelectedAgreement(first);
    if (first) await loadPrices(first);
    else setPrices([]);
    setLoading(false);
  }, [customerId, loadPrices]);

  useEffect(() => {
    if (open && customerId) loadAgreements();
  }, [open, customerId, loadAgreements]);

  const createAgreement = async () => {
    if (!customerId || !form.agreement_name.trim()) {
      toast({ title: 'Agreement name required', variant: 'destructive' });
      return;
    }
    if (form.end_date < form.start_date) {
      toast({ title: 'End date must be after start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('customer_price_lists')
      .insert({
        customer_id: customerId,
        agreement_name: form.agreement_name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || null,
        created_by: user?.id || null,
      })
      .select('id, agreement_name, start_date, end_date, is_active, notes')
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      toast({ title: 'Could not save agreement', description: error?.message, variant: 'destructive' });
      return;
    }
    setAgreements([data as Agreement, ...agreements]);
    setSelectedAgreement((data as Agreement).id);
    setPrices([]);
    setForm({ agreement_name: '', start_date: today(), end_date: inOneYear(), notes: '' });
    toast({ title: 'Agreement created', description: 'Now add the contract prices below.' });
  };

  const toggleActive = async (ag: Agreement) => {
    const { error } = await supabase
      .from('customer_price_lists')
      .update({ is_active: !ag.is_active })
      .eq('id', ag.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setAgreements(agreements.map(a => (a.id === ag.id ? { ...a, is_active: !ag.is_active } : a)));
  };

  const deleteAgreement = async (id: string) => {
    const { error } = await supabase.from('customer_price_lists').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    const rest = agreements.filter(a => a.id !== id);
    setAgreements(rest);
    if (selectedAgreement === id) {
      setSelectedAgreement(rest[0]?.id || null);
      if (rest[0]) loadPrices(rest[0].id);
      else setPrices([]);
    }
  };

  const addPrice = async () => {
    if (!selectedAgreement || !newPrice.product_id || newPrice.custom_price === '') {
      toast({ title: 'Select a product and price', variant: 'destructive' });
      return;
    }
    const sel = products.find(p => p.id === newPrice.product_id) || null;
    const isArea = sel?.sale_type === 'area';
    if (isArea && (newPrice.width !== '' || newPrice.height !== '')) {
      const w = Number(newPrice.width);
      const h = Number(newPrice.height);
      if (!(w > 0) || !(h > 0)) {
        toast({ title: 'Width and height must both be greater than 0', variant: 'destructive' });
        return;
      }
    }
    const enteredPrice = Number(newPrice.custom_price);
    const w = Number(newPrice.width);
    const h = Number(newPrice.height);
    const hasSize = isArea && w > 0 && h > 0;
    const area = hasSize ? w * h : 0;
    // With a size, the typed price is the TOTAL for that size; store the per-m² rate too
    const perUnit = hasSize && area > 0 ? enteredPrice / area : enteredPrice;

    const payload = {
      agreement_id: selectedAgreement,
      product_id: newPrice.product_id,
      custom_price: perUnit,
      width: hasSize ? w : null,
      height: hasSize ? h : null,
      total_price: hasSize ? enteredPrice : null,
    };
    const existing = prices.find(
      p => p.product_id === newPrice.product_id &&
        Number(p.width ?? 0) === (hasSize ? w : 0) &&
        Number(p.height ?? 0) === (hasSize ? h : 0)
    );
    const { data, error } = existing
      ? await supabase
          .from('contract_product_prices')
          .update(payload)
          .eq('id', existing.id)
          .select('id, product_id, custom_price, width, height, total_price')
          .maybeSingle()
      : await supabase
          .from('contract_product_prices')
          .insert(payload)
          .select('id, product_id, custom_price, width, height, total_price')
          .maybeSingle();
    if (error || !data) {
      toast({ title: 'Could not save price', description: error?.message, variant: 'destructive' });
      return;
    }
    const row = data as ContractPrice;
    setPrices([
      ...prices.filter(p => !(p.product_id === row.product_id && (p.width ?? null) === (row.width ?? null) && (p.height ?? null) === (row.height ?? null))),
      row,
    ]);
    setNewPrice({ product_id: '', custom_price: '', width: '', height: '' });
    toast({
      title: 'Contract price saved',
      description: hasSize
        ? `${w}m × ${h}m = $${enteredPrice.toFixed(2)} (you can add more sizes for the same product)`
        : undefined,
    });
  };

  const removePrice = async (id: string) => {
    const { error } = await supabase.from('contract_product_prices').delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setPrices(prices.filter(p => p.id !== id));
  };

  const isCurrentlyValid = (ag: Agreement) => {
    const t = today();
    return ag.is_active && ag.start_date <= t && ag.end_date >= t;
  };

  const current = agreements.find(a => a.id === selectedAgreement) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Framework Agreement Prices — {customerName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-6 min-w-0">
            {canEdit && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">New Agreement</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                  <div className="grid gap-1 md:col-span-2">
                    <Label>Agreement name</Label>
                    <Input
                      value={form.agreement_name}
                      onChange={(e) => setForm({ ...form, agreement_name: e.target.value })}
                      placeholder="e.g. 2026 Printing Framework Contract"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Start date</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label>End date</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                  <div className="grid gap-1 md:col-span-3">
                    <Label>Notes (optional)</Label>
                    <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Contract reference, scope…" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={createAgreement} disabled={saving} className="w-full gap-2">
                      <Plus className="h-4 w-4" /> Create
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Agreements</Label>
              {agreements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agreements yet for this customer.</p>
              ) : (
                agreements.map((ag) => (
                  <div
                    key={ag.id}
                    className={`flex flex-wrap items-center gap-3 rounded-md border p-3 cursor-pointer ${selectedAgreement === ag.id ? 'border-primary bg-muted/40' : ''}`}
                    onClick={() => { setSelectedAgreement(ag.id); loadPrices(ag.id); }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{ag.agreement_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(ag.start_date), 'dd MMM yyyy')} → {format(new Date(ag.end_date), 'dd MMM yyyy')}
                      </div>
                    </div>
                    <Badge variant={isCurrentlyValid(ag) ? 'default' : 'secondary'}>
                      {isCurrentlyValid(ag) ? 'Active now' : ag.is_active ? 'Not in date range' : 'Disabled'}
                    </Badge>
                    {canEdit && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Switch checked={ag.is_active} onCheckedChange={() => toggleActive(ag)} />
                        <Button variant="ghost" size="sm" onClick={() => deleteAgreement(ag.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {current && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Contract Prices — {current.agreement_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {prices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contract prices defined yet.</p>
                  ) : (
                    prices.map((pr) => {
                      const product = products.find(p => p.id === pr.product_id);
                      const std = product ? standardPriceOf(product) : 0;
                      return (
                        <div key={pr.id} className="flex flex-wrap items-center gap-3 rounded-md border p-2">
                          <span className="flex-1 min-w-0 truncate">{product?.name || 'Product'}</span>
                          {product && (
                            <Badge variant="outline" className="whitespace-nowrap">
                              {product.sale_type === 'area' ? 'per m²' : `per ${product.retail_unit || 'piece'}`}
                            </Badge>
                          )}
                          <span className="text-sm text-muted-foreground line-through">${std.toFixed(2)}</span>
                          <span className="font-semibold text-primary">
                            ${Number(pr.custom_price).toFixed(2)}{product ? priceUnitOf(product) : ''}
                          </span>
                          {canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => removePrice(pr.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}

                  {canEdit && (
                    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                      <div className="grid gap-1 min-w-[220px] flex-1">
                        <Label>Product / material</Label>
                        <Select value={newPrice.product_id} onValueChange={(v) => setNewPrice({ ...newPrice, product_id: v })}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} (standard ${standardPriceOf(p).toFixed(2)}{priceUnitOf(p)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(() => {
                        const sel = products.find(p => p.id === newPrice.product_id) || null;
                        const isArea = sel?.sale_type === 'area';
                        const hasSize = isArea && Number(newPrice.width) > 0 && Number(newPrice.height) > 0;
                        const area = hasSize ? Number(newPrice.width) * Number(newPrice.height) : 0;
                        const rate = Number(newPrice.custom_price || '0');
                        return (
                          <>
                            {isArea && (
                              <>
                                <div className="grid gap-1 w-[100px]">
                                  <Label>Width (m)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newPrice.width}
                                    onChange={(e) => setNewPrice({ ...newPrice, width: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="grid gap-1 w-[100px]">
                                  <Label>Height (m)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newPrice.height}
                                    onChange={(e) => setNewPrice({ ...newPrice, height: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="grid gap-1 w-[90px]">
                                  <Label>m²</Label>
                                  <Input readOnly value={hasSize ? area.toFixed(2) : ''} placeholder="auto" className="bg-muted" />
                                </div>
                              </>
                            )}
                            <div className="grid gap-1 w-[220px]">
                              <Label>{isArea ? 'Price per m²' : `Price per ${sel?.retail_unit || 'piece'}`}</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={newPrice.custom_price}
                                  onChange={(e) => setNewPrice({ ...newPrice, custom_price: e.target.value })}
                                  placeholder="0.00"
                                />
                                <Badge variant="secondary" className="whitespace-nowrap">
                                  {sel ? (isArea ? 'm²' : (sel.retail_unit || 'pcs')) : 'unit'}
                                </Badge>
                              </div>
                              {sel && (
                                <p className="text-xs text-muted-foreground">
                                  {isArea
                                    ? hasSize
                                      ? `Total for ${newPrice.width}m × ${newPrice.height}m (${area.toFixed(2)} m²) = $${(area * rate).toFixed(2)}`
                                      : 'Enter Width × Height like on an invoice — the m² and total are calculated for you. Price is per m².'
                                    : 'Measured by piece — price is for 1 item.'}
                                </p>
                              )}
                            </div>
                          </>
                        );
                      })()}
                      <Button onClick={addPrice} className="gap-2">
                        <Plus className="h-4 w-4" /> Add price
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
