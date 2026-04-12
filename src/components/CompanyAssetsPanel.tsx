import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';

interface CompanyAsset {
  id: string;
  asset_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  notes: string | null;
  created_at: string;
}

export function CompanyAssetsPanel() {
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [assetName, setAssetName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    const { data, error } = await supabase
      .from('company_assets')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setAssets(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setAssetName('');
    setQuantity('1');
    setUnitPrice('');
    setNotes('');
    setEditingAsset(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (asset: CompanyAsset) => {
    setEditingAsset(asset);
    setAssetName(asset.asset_name);
    setQuantity(String(asset.quantity));
    setUnitPrice(String(asset.unit_price));
    setNotes(asset.notes || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!assetName || !unitPrice) {
      toast({ title: 'Please fill in name and price', variant: 'destructive' });
      return;
    }

    const payload = {
      asset_name: assetName,
      quantity: parseInt(quantity) || 1,
      unit_price: parseFloat(unitPrice) || 0,
      notes: notes || null,
    };

    if (editingAsset) {
      const { error } = await supabase
        .from('company_assets')
        .update(payload)
        .eq('id', editingAsset.id);
      if (error) {
        toast({ title: 'Error updating asset', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Asset updated' });
    } else {
      const { error } = await supabase
        .from('company_assets')
        .insert({ ...payload, created_by: user?.id });
      if (error) {
        toast({ title: 'Error adding asset', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Asset added' });
    }

    setDialogOpen(false);
    resetForm();
    fetchAssets();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('company_assets').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error deleting asset', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Asset deleted' });
    fetchAssets();
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const grandTotal = assets.reduce((sum, a) => sum + (a.total_value || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Company Assets
        </CardTitle>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Asset
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Loading...</p>
        ) : assets.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No assets recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine / Asset Name</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map(asset => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.asset_name}</TableCell>
                    <TableCell className="text-right">{asset.quantity}</TableCell>
                    <TableCell className="text-right">${fmt(asset.unit_price)}</TableCell>
                    <TableCell className="text-right font-semibold">${fmt(asset.total_value)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{asset.notes || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(asset)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(asset.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="text-right">Grand Total</TableCell>
                  <TableCell className="text-right">${fmt(grandTotal)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit Asset' : 'Add New Asset'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Machine / Asset Name</Label>
              <Input value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="e.g. Printing Machine" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
              <div>
                <Label>Unit Price ($)</Label>
                <Input type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingAsset ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
