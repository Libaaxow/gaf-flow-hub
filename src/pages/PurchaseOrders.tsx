import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Eye, ClipboardList, CheckCircle, XCircle, Truck, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor?: { name: string };
  status: 'draft' | 'sent' | 'approved' | 'received' | 'cancelled';
  order_date: string;
  expected_delivery_date: string | null;
  subtotal: number;
  vat_enabled: boolean;
  vat_percentage: number;
  vat_amount: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
}

interface Product {
  id: string;
  product_code: string;
  name: string;
  cost_price: number;
  unit: string;
}

interface POItem {
  id?: string;
  product_id: string;
  product?: { product_code: string; name: string; unit: string };
  quantity: number;
  unit_cost: number;
  amount: number;
}

interface TaxSettings {
  vat_enabled: boolean;
  vat_percentage: number;
}

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({ vat_enabled: false, vat_percentage: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [selectedPOItems, setSelectedPOItems] = useState<POItem[]>([]);
  const [canManagePO, setCanManagePO] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Form state
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [expectedDelivery, setExpectedDelivery] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [poItems, setPOItems] = useState<POItem[]>([{ product_id: '', quantity: 1, unit_cost: 0, amount: 0 }]);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPercentage, setVatPercentage] = useState(0);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    checkPermissions();

    const channel = supabase
      .channel('po-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
        fetchPurchaseOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkPermissions = async () => {
    if (!user) return;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const userRoles = roles?.map(r => r.role) || [];
    setIsAdmin(userRoles.includes('admin'));
    setCanManagePO(userRoles.includes('admin') || userRoles.includes('accountant'));
  };

  const fetchData = async () => {
    await Promise.all([fetchPurchaseOrders(), fetchVendors(), fetchProducts(), fetchTaxSettings()]);
    setLoading(false);
  };

  const fetchPurchaseOrders = async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, vendor:vendors(name)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setPurchaseOrders(data || []);
    }
  };

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    setVendors(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, product_code, name, cost_price, unit')
      .eq('status', 'active')
      .order('name');
    setProducts(data || []);
  };

  const fetchTaxSettings = async () => {
    const { data } = await supabase.from('tax_settings').select('*').limit(1).maybeSingle();
    if (data) {
      setTaxSettings({ vat_enabled: data.vat_enabled, vat_percentage: Number(data.vat_percentage) });
      setVatEnabled(data.vat_enabled);
      setVatPercentage(Number(data.vat_percentage));
    }
  };

  const fetchPOItems = async (poId: string) => {
    const { data } = await supabase
      .from('purchase_order_items')
      .select('*, product:products(product_code, name, unit)')
      .eq('purchase_order_id', poId);
    setSelectedPOItems(data || []);
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const newItems = [...poItems];
    newItems[index] = {
      ...newItems[index],
      product_id: productId,
      unit_cost: product?.cost_price || 0,
      amount: (product?.cost_price || 0) * newItems[index].quantity,
    };
    setPOItems(newItems);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const newItems = [...poItems];
    newItems[index] = {
      ...newItems[index],
      quantity,
      amount: quantity * newItems[index].unit_cost,
    };
    setPOItems(newItems);
  };

  const handleUnitCostChange = (index: number, unitCost: number) => {
    const newItems = [...poItems];
    newItems[index] = {
      ...newItems[index],
      unit_cost: unitCost,
      amount: unitCost * newItems[index].quantity,
    };
    setPOItems(newItems);
  };

  const addItem = () => {
    setPOItems([...poItems, { product_id: '', quantity: 1, unit_cost: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (poItems.length > 1) {
      setPOItems(poItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = poItems.reduce((sum, item) => sum + item.amount, 0);
    const vatAmount = vatEnabled ? (subtotal * vatPercentage) / 100 : 0;
    const total = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVendor) {
      toast({ title: 'Error', description: 'Please select a vendor', variant: 'destructive' });
      return;
    }

    if (poItems.some(item => !item.product_id)) {
      toast({ title: 'Error', description: 'Please select products for all items', variant: 'destructive' });
      return;
    }

    try {
      const { data: poNumber } = await supabase.rpc('generate_po_number');
      const { subtotal, vatAmount, total } = calculateTotals();

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: poNumber,
          vendor_id: selectedVendor,
          order_date: orderDate,
          expected_delivery_date: expectedDelivery || null,
          subtotal,
          vat_enabled: vatEnabled,
          vat_percentage: vatPercentage,
          vat_amount: vatAmount,
          total_amount: total,
          notes: notes || null,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (poError) throw poError;

      // Insert items
      const itemsToInsert = poItems.map(item => ({
        purchase_order_id: po.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast({ title: 'Success', description: 'Purchase order created successfully' });
      resetForm();
      setIsDialogOpen(false);
      fetchPurchaseOrders();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setSelectedVendor('');
    setOrderDate(format(new Date(), 'yyyy-MM-dd'));
    setExpectedDelivery('');
    setNotes('');
    setPOItems([{ product_id: '', quantity: 1, unit_cost: 0, amount: 0 }]);
    setVatEnabled(taxSettings.vat_enabled);
    setVatPercentage(taxSettings.vat_percentage);
  };

  const handleStatusChange = async (po: PurchaseOrder, newStatus: 'sent' | 'approved' | 'received' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', po.id);

      if (error) throw error;

      // If marked as received, create a vendor bill automatically
      if (newStatus === 'received') {
        const { data: billNumber } = await supabase.rpc('generate_vendor_bill_number');
        
        const { error: billError } = await supabase
          .from('vendor_bills')
          .insert([{
            bill_number: billNumber,
            vendor_id: po.vendor_id,
            purchase_order_id: po.id,
            subtotal: po.subtotal,
            vat_amount: po.vat_amount,
            total_amount: po.total_amount,
            created_by: user?.id,
          }]);

        if (billError) throw billError;
        toast({ title: 'Success', description: 'PO received and vendor bill created' });
      } else {
        toast({ title: 'Success', description: `Status updated to ${newStatus}` });
      }

      fetchPurchaseOrders();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      draft: 'secondary',
      sent: 'outline',
      approved: 'default',
      received: 'default',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch = 
      po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendor?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const { subtotal, vatAmount, total } = calculateTotals();

  // Stats
  const totalPOs = purchaseOrders.length;
  const draftPOs = purchaseOrders.filter(p => p.status === 'draft').length;
  const pendingPOs = purchaseOrders.filter(p => ['sent', 'approved'].includes(p.status)).length;
  const receivedPOs = purchaseOrders.filter(p => p.status === 'received').length;
  const totalValue = purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading purchase orders...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-muted-foreground">Manage vendor purchase orders</p>
          </div>
          
          {canManagePO && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create PO
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Purchase Order</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreatePO} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Vendor *</Label>
                      <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Order Date</Label>
                      <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Expected Delivery Date</Label>
                    <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Add Item</Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-sm">Product</th>
                            <th className="px-3 py-2 text-left text-sm w-24">Qty</th>
                            <th className="px-3 py-2 text-left text-sm w-32">Unit Cost</th>
                            <th className="px-3 py-2 text-left text-sm w-32">Amount</th>
                            <th className="px-3 py-2 w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {poItems.map((item, index) => (
                            <tr key={index} className="border-t">
                              <td className="px-3 py-2">
                                <Select value={item.product_id} onValueChange={(v) => handleProductChange(index, v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unit_cost}
                                  onChange={(e) => handleUnitCostChange(index, parseFloat(e.target.value) || 0)}
                                />
                              </td>
                              <td className="px-3 py-2 font-medium">${item.amount.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                {poItems.length > 1 && (
                                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>×</Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={vatEnabled} onChange={(e) => setVatEnabled(e.target.checked)} className="rounded" />
                      <span>Apply VAT</span>
                    </label>
                    {vatEnabled && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={vatPercentage}
                          onChange={(e) => setVatPercentage(parseFloat(e.target.value) || 0)}
                          className="w-20"
                        />
                        <span>%</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>
                    {vatEnabled && <div className="flex justify-between"><span>VAT ({vatPercentage}%):</span><span>${vatAmount.toFixed(2)}</span></div>}
                    <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total:</span><span>${total.toFixed(2)}</span></div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </div>

                  <Button type="submit" className="w-full">Create Purchase Order</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalPOs}</div><p className="text-sm text-muted-foreground">Total POs</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-muted-foreground">{draftPOs}</div><p className="text-sm text-muted-foreground">Draft</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{pendingPOs}</div><p className="text-sm text-muted-foreground">Pending</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-600">{receivedPOs}</div><p className="text-sm text-muted-foreground">Received</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-primary">${totalValue.toLocaleString()}</div><p className="text-sm text-muted-foreground">Total Value</p></CardContent></Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search PO number, vendor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* PO Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">PO Number</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Vendor</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPOs.map((po) => (
                    <tr key={po.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-medium">{po.po_number}</td>
                      <td className="px-6 py-4">{po.vendor?.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{format(new Date(po.order_date), 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 font-medium">${po.total_amount.toLocaleString()}</td>
                      <td className="px-6 py-4">{getStatusBadge(po.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedPO(po); fetchPOItems(po.id); setIsViewDialogOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManagePO && po.status === 'draft' && (
                            <Button variant="ghost" size="sm" onClick={() => handleStatusChange(po, 'sent')} title="Send to Vendor">
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {canManagePO && po.status === 'sent' && (
                            <Button variant="ghost" size="sm" onClick={() => handleStatusChange(po, 'approved')} title="Approve">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {canManagePO && po.status === 'approved' && (
                            <Button variant="ghost" size="sm" onClick={() => handleStatusChange(po, 'received')} title="Mark Received">
                              <Truck className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {canManagePO && !['received', 'cancelled'].includes(po.status) && (
                            <Button variant="ghost" size="sm" onClick={() => handleStatusChange(po, 'cancelled')} title="Cancel">
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPOs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No purchase orders found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* View PO Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Purchase Order Details</DialogTitle>
            </DialogHeader>
            {selectedPO && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">PO Number</Label><p className="font-mono font-bold">{selectedPO.po_number}</p></div>
                  <div><Label className="text-muted-foreground">Status</Label><p>{getStatusBadge(selectedPO.status)}</p></div>
                  <div><Label className="text-muted-foreground">Vendor</Label><p>{selectedPO.vendor?.name}</p></div>
                  <div><Label className="text-muted-foreground">Order Date</Label><p>{format(new Date(selectedPO.order_date), 'MMM d, yyyy')}</p></div>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm">Product</th>
                        <th className="px-4 py-2 text-left text-sm">Qty</th>
                        <th className="px-4 py-2 text-left text-sm">Unit Cost</th>
                        <th className="px-4 py-2 text-left text-sm">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPOItems.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-2">{item.product?.name}</td>
                          <td className="px-4 py-2">{item.quantity}</td>
                          <td className="px-4 py-2">${item.unit_cost.toFixed(2)}</td>
                          <td className="px-4 py-2">${item.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                  <div className="flex justify-between"><span>Subtotal:</span><span>${selectedPO.subtotal.toFixed(2)}</span></div>
                  {selectedPO.vat_enabled && <div className="flex justify-between"><span>VAT ({selectedPO.vat_percentage}%):</span><span>${selectedPO.vat_amount.toFixed(2)}</span></div>}
                  <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total:</span><span>${selectedPO.total_amount.toFixed(2)}</span></div>
                </div>

                {selectedPO.notes && (
                  <div><Label className="text-muted-foreground">Notes</Label><p>{selectedPO.notes}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default PurchaseOrders;
