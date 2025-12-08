import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Pencil, Eye, Power, Trash2, Package, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

interface Product {
  id: string;
  product_code: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  purchase_unit: string;
  retail_unit: string;
  conversion_rate: number;
  cost_price: number;
  selling_price: number;
  cost_per_retail_unit: number;
  profit_per_unit: number;
  stock_quantity: number;
  reorder_level: number;
  preferred_vendor_id: string | null;
  status: string;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
  status: string;
}

const PURCHASE_UNITS = ['Box', 'Roll', 'Carton', 'Pack', 'Bag', 'Bundle', 'Drum', 'Pallet'];
const RETAIL_UNITS = ['Piece', 'Meter', 'Sheet', 'Kg', 'Liter', 'Unit', 'Pair', 'Set'];

const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  purchase_unit: z.string().min(1, 'Purchase unit is required'),
  retail_unit: z.string().min(1, 'Retail unit is required'),
  conversion_rate: z.number().min(0.0001, 'Conversion rate must be positive'),
  cost_price: z.number().min(0, 'Cost price must be positive'),
  selling_price: z.number().min(0, 'Selling price must be positive'),
  reorder_level: z.number().min(0, 'Reorder level must be positive'),
  preferred_vendor_id: z.string().nullable().optional(),
});

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageProducts, setCanManageProducts] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchProducts();
    fetchVendors();
    checkPermissions();

    const channel = supabase
      .channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
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
    setCanManageProducts(userRoles.includes('admin') || userRoles.includes('accountant'));
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name, status')
      .eq('status', 'active')
      .order('name');
    setVendors(data || []);
  };

  const generateProductCode = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_product_code');
    if (error) throw error;
    return data;
  };

  const handleAddProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const productData = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      category: (formData.get('category') as string) || null,
      purchase_unit: formData.get('purchase_unit') as string,
      retail_unit: formData.get('retail_unit') as string,
      unit: formData.get('retail_unit') as string, // Keep unit synced with retail_unit for backward compatibility
      conversion_rate: parseFloat(formData.get('conversion_rate') as string) || 1,
      cost_price: parseFloat(formData.get('cost_price') as string) || 0,
      selling_price: parseFloat(formData.get('selling_price') as string) || 0,
      reorder_level: parseInt(formData.get('reorder_level') as string) || 0,
      preferred_vendor_id: (formData.get('preferred_vendor_id') as string) || null,
    };

    try {
      productSchema.parse(productData);
      const productCode = await generateProductCode();

      const { error } = await supabase
        .from('products')
        .insert([{ 
          ...productData,
          product_code: productCode,
          created_by: user?.id || null,
        }]);

      if (error) throw error;

      toast({ title: 'Success', description: 'Product added successfully' });
      form.reset();
      setIsDialogOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const productData = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      category: (formData.get('category') as string) || null,
      purchase_unit: formData.get('purchase_unit') as string,
      retail_unit: formData.get('retail_unit') as string,
      unit: formData.get('retail_unit') as string, // Keep unit synced with retail_unit
      conversion_rate: parseFloat(formData.get('conversion_rate') as string) || 1,
      cost_price: parseFloat(formData.get('cost_price') as string) || 0,
      selling_price: parseFloat(formData.get('selling_price') as string) || 0,
      reorder_level: parseInt(formData.get('reorder_level') as string) || 0,
      preferred_vendor_id: (formData.get('preferred_vendor_id') as string) || null,
    };

    try {
      productSchema.parse(productData);

      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', selectedProduct.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Product updated successfully' });
      setIsEditDialogOpen(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleStatus = async (product: Product) => {
    const newStatus = product.status === 'active' ? 'inactive' : 'active';
    
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: newStatus })
        .eq('id', product.id);

      if (error) throw error;

      toast({ title: 'Success', description: `Product ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully` });
      fetchProducts();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', selectedProduct.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Product deleted successfully' });
      setIsDeleteDialogOpen(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.status === 'active').length;
  const lowStockProducts = products.filter(p => p.stock_quantity <= p.reorder_level && p.stock_quantity > 0).length;
  const outOfStock = products.filter(p => p.stock_quantity === 0).length;
  const totalValue = products.reduce((sum, p) => sum + (p.cost_price * p.stock_quantity), 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading products...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Products & Inventory</h1>
            <p className="text-muted-foreground">Manage your product catalog and stock levels</p>
          </div>
          
          {canManageProducts && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Product</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Product Name *</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" name="category" placeholder="e.g. Electronics" />
                  </div>
                  
                  {/* Dual Unit Section */}
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Unit Conversion</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="purchase_unit">Purchase Unit *</Label>
                        <Select name="purchase_unit" defaultValue="Box">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PURCHASE_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="conversion_rate">= How Many</Label>
                        <Input id="conversion_rate" name="conversion_rate" type="number" step="0.0001" defaultValue="1" min="0.0001" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="retail_unit">Retail Unit *</Label>
                        <Select name="retail_unit" defaultValue="Piece">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RETAIL_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Example: 1 Box = 12 Pieces means purchase unit is Box, retail unit is Piece, conversion rate is 12</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cost_price">Cost per Purchase Unit ($)</Label>
                      <Input id="cost_price" name="cost_price" type="number" step="0.01" defaultValue="0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="selling_price">Selling Price per Retail Unit ($)</Label>
                      <Input id="selling_price" name="selling_price" type="number" step="0.01" defaultValue="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">Reorder Level (in retail units)</Label>
                    <Input id="reorder_level" name="reorder_level" type="number" defaultValue="10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferred_vendor_id">Preferred Vendor</Label>
                    <Select name="preferred_vendor_id">
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={2} />
                  </div>
                  <Button type="submit" className="w-full">Add Product</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalProducts}</div>
              <p className="text-sm text-muted-foreground">Total Products</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{activeProducts}</div>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{lowStockProducts}</div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{outOfStock}</div>
              <p className="text-sm text-muted-foreground">Out of Stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">${totalValue.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Inventory Value</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Products Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Code</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Units</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Stock</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Cost/Retail</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Sell Price</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Profit</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 font-mono text-sm">{product.product_code}</td>
                      <td className="px-4 py-4">
                        <div>
                          <span className="font-medium">{product.name}</span>
                          {product.category && <span className="text-xs text-muted-foreground block">{product.category}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-muted-foreground">
                          <span className="block">Buy: {product.purchase_unit}</span>
                          <span className="block">Sell: {product.retail_unit}</span>
                          <span className="text-xs text-primary">1:{product.conversion_rate}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={product.stock_quantity <= product.reorder_level ? 'text-destructive font-medium' : ''}>
                            {product.stock_quantity} {product.retail_unit}
                          </span>
                          {product.stock_quantity <= product.reorder_level && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="text-muted-foreground">${(product.cost_per_retail_unit || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-4">${product.selling_price.toLocaleString()}</td>
                      <td className="px-4 py-4">
                        <span className={`font-medium ${(product.profit_per_unit || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          ${(product.profit_per_unit || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                          {product.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(product); setIsViewDialogOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManageProducts && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(product); setIsEditDialogOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(product)}>
                                <Power className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {isAdmin && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setSelectedProduct(product); setIsDeleteDialogOpen(true); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No products found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
            </DialogHeader>
            {selectedProduct && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">Code</Label><p className="font-mono">{selectedProduct.product_code}</p></div>
                  <div><Label className="text-muted-foreground">Name</Label><p className="font-medium">{selectedProduct.name}</p></div>
                  <div><Label className="text-muted-foreground">Category</Label><p>{selectedProduct.category || '-'}</p></div>
                  <div><Label className="text-muted-foreground">Status</Label><Badge variant={selectedProduct.status === 'active' ? 'default' : 'secondary'}>{selectedProduct.status}</Badge></div>
                </div>
                
                {/* Unit Conversion Info */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <p className="text-sm font-medium">Unit Conversion</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><Label className="text-muted-foreground">Purchase Unit</Label><p>{selectedProduct.purchase_unit}</p></div>
                    <div><Label className="text-muted-foreground">Conversion</Label><p className="font-mono">1:{selectedProduct.conversion_rate}</p></div>
                    <div><Label className="text-muted-foreground">Retail Unit</Label><p>{selectedProduct.retail_unit}</p></div>
                  </div>
                </div>

                {/* Pricing Info */}
                <div className="p-3 bg-primary/5 rounded-lg space-y-2">
                  <p className="text-sm font-medium">Pricing & Profit</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><Label className="text-muted-foreground">Cost per {selectedProduct.purchase_unit}</Label><p>${selectedProduct.cost_price.toLocaleString()}</p></div>
                    <div><Label className="text-muted-foreground">Cost per {selectedProduct.retail_unit}</Label><p className="text-muted-foreground">${(selectedProduct.cost_per_retail_unit || 0).toFixed(2)}</p></div>
                    <div><Label className="text-muted-foreground">Selling Price per {selectedProduct.retail_unit}</Label><p>${selectedProduct.selling_price.toLocaleString()}</p></div>
                    <div><Label className="text-muted-foreground">Profit per {selectedProduct.retail_unit}</Label><p className={`font-medium ${(selectedProduct.profit_per_unit || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>${(selectedProduct.profit_per_unit || 0).toFixed(2)}</p></div>
                  </div>
                </div>

                {/* Stock Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-muted-foreground">Stock (in {selectedProduct.retail_unit})</Label><p className="font-medium">{selectedProduct.stock_quantity}</p></div>
                  <div><Label className="text-muted-foreground">Reorder Level</Label><p>{selectedProduct.reorder_level}</p></div>
                </div>
                
                {selectedProduct.description && (
                  <div><Label className="text-muted-foreground">Description</Label><p>{selectedProduct.description}</p></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            {selectedProduct && (
              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Product Name *</Label>
                  <Input id="edit-name" name="name" defaultValue={selectedProduct.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Category</Label>
                  <Input id="edit-category" name="category" defaultValue={selectedProduct.category || ''} />
                </div>
                
                {/* Dual Unit Section */}
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Unit Conversion</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-purchase_unit">Purchase Unit *</Label>
                      <Select name="purchase_unit" defaultValue={selectedProduct.purchase_unit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PURCHASE_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-conversion_rate">= How Many</Label>
                      <Input id="edit-conversion_rate" name="conversion_rate" type="number" step="0.0001" defaultValue={selectedProduct.conversion_rate} min="0.0001" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-retail_unit">Retail Unit *</Label>
                      <Select name="retail_unit" defaultValue={selectedProduct.retail_unit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RETAIL_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cost_price">Cost per Purchase Unit ($)</Label>
                    <Input id="edit-cost_price" name="cost_price" type="number" step="0.01" defaultValue={selectedProduct.cost_price} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-selling_price">Selling Price per Retail Unit ($)</Label>
                    <Input id="edit-selling_price" name="selling_price" type="number" step="0.01" defaultValue={selectedProduct.selling_price} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reorder_level">Reorder Level (in retail units)</Label>
                  <Input id="edit-reorder_level" name="reorder_level" type="number" defaultValue={selectedProduct.reorder_level} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-preferred_vendor_id">Preferred Vendor</Label>
                  <Select name="preferred_vendor_id" defaultValue={selectedProduct.preferred_vendor_id || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea id="edit-description" name="description" rows={2} defaultValue={selectedProduct.description || ''} />
                </div>
                <Button type="submit" className="w-full">Update Product</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Product</DialogTitle>
            </DialogHeader>
            <p>Are you sure you want to delete "{selectedProduct?.name}"? This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteProduct}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Products;
