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
import { Plus, Search, Pencil, Eye, Power, Trash2, Building2, Phone, Mail, MapPin, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { format } from 'date-fns';

interface Vendor {
  id: string;
  vendor_code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

interface VendorStats {
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
}

const vendorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const Vendors = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorStats, setVendorStats] = useState<Record<string, VendorStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageVendors, setCanManageVendors] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchVendors();
    checkPermissions();

    const channel = supabase
      .channel('vendors-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vendors',
        },
        () => {
          fetchVendors();
        }
      )
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
    setCanManageVendors(userRoles.includes('admin') || userRoles.includes('accountant'));
  };

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedVendors = (data || []).map(v => ({
        ...v,
        status: v.status as 'active' | 'inactive'
      }));
      
      setVendors(typedVendors);
      
      // Fetch stats for each vendor
      await fetchVendorStats(typedVendors);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorStats = async (vendorList: Vendor[]) => {
    const stats: Record<string, VendorStats> = {};
    
    for (const vendor of vendorList) {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('vendor_id', vendor.id);
      
      const totalPurchases = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      // For now, assuming all expenses are paid - this can be enhanced with a payments system for vendors
      const totalPaid = totalPurchases;
      
      stats[vendor.id] = {
        totalPurchases,
        totalPaid,
        outstanding: totalPurchases - totalPaid
      };
    }
    
    setVendorStats(stats);
  };

  const generateVendorCode = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_vendor_code');
    if (error) throw error;
    return data;
  };

  const handleAddVendor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const vendorData = {
      name: formData.get('name') as string,
      contact_person: (formData.get('contact_person') as string) || null,
      phone: (formData.get('phone') as string) || null,
      email: (formData.get('email') as string) || null,
      address: (formData.get('address') as string) || null,
      notes: (formData.get('notes') as string) || null,
    };

    try {
      vendorSchema.parse(vendorData);
      
      const vendorCode = await generateVendorCode();

      const { error } = await supabase
        .from('vendors')
        .insert([{ 
          ...vendorData,
          vendor_code: vendorCode,
          created_by: user?.id || null,
        }]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Vendor added successfully',
      });

      form.reset();
      setIsDialogOpen(false);
      fetchVendors();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateVendor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedVendor) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const vendorData = {
      name: formData.get('name') as string,
      contact_person: (formData.get('contact_person') as string) || null,
      phone: (formData.get('phone') as string) || null,
      email: (formData.get('email') as string) || null,
      address: (formData.get('address') as string) || null,
      notes: (formData.get('notes') as string) || null,
    };

    try {
      vendorSchema.parse(vendorData);

      const { error } = await supabase
        .from('vendors')
        .update(vendorData)
        .eq('id', selectedVendor.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Vendor updated successfully',
      });

      setIsEditDialogOpen(false);
      setSelectedVendor(null);
      fetchVendors();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (vendor: Vendor) => {
    const newStatus = vendor.status === 'active' ? 'inactive' : 'active';
    
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ status: newStatus })
        .eq('id', vendor.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Vendor ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      });

      fetchVendors();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteVendor = async () => {
    if (!selectedVendor) return;

    // Check if vendor has transactions
    const stats = vendorStats[selectedVendor.id];
    if (stats && stats.totalPurchases > 0) {
      toast({
        title: 'Cannot Delete',
        description: 'This vendor has transactions. Deactivate instead.',
        variant: 'destructive',
      });
      setIsDeleteDialogOpen(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', selectedVendor.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Vendor deleted successfully',
      });

      setIsDeleteDialogOpen(false);
      setSelectedVendor(null);
      fetchVendors();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredVendors = vendors.filter(vendor => {
    const matchesSearch = 
      vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.vendor_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || vendor.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalVendors = vendors.length;
  const activeVendors = vendors.filter(v => v.status === 'active').length;
  const inactiveVendors = vendors.filter(v => v.status === 'inactive').length;
  const totalSpending = Object.values(vendorStats).reduce((sum, s) => sum + s.totalPurchases, 0);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading vendors...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
            <p className="text-muted-foreground">Manage your supplier database</p>
          </div>
          
          {canManageVendors && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddVendor} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Vendor Name *</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_person">Contact Person</Label>
                    <Input id="contact_person" name="contact_person" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" name="phone" type="tel" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea id="address" name="address" rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" rows={2} />
                  </div>
                  <Button type="submit" className="w-full">Add Vendor</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totalVendors}</div>
              <p className="text-sm text-muted-foreground">Total Vendors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{activeVendors}</div>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-muted-foreground">{inactiveVendors}</div>
              <p className="text-sm text-muted-foreground">Inactive</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">${totalSpending.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Total Spending</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
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
        </div>

        {/* Vendors Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Code</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Contact</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Phone</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Total Purchases</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((vendor) => {
                    const stats = vendorStats[vendor.id] || { totalPurchases: 0, totalPaid: 0, outstanding: 0 };
                    return (
                      <tr key={vendor.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-sm">{vendor.vendor_code}</td>
                        <td 
                          className="px-6 py-4 font-medium text-primary hover:underline cursor-pointer"
                          onClick={() => navigate(`/vendors/${vendor.id}/analytics`)}
                        >
                          {vendor.name}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{vendor.contact_person || '-'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{vendor.phone || '-'}</td>
                        <td className="px-6 py-4 font-medium">${stats.totalPurchases.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <Badge variant={vendor.status === 'active' ? 'default' : 'secondary'}>
                            {vendor.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedVendor(vendor);
                                setIsViewDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canManageVendors && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedVendor(vendor);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleStatus(vendor)}
                                >
                                  <Power className={`h-4 w-4 ${vendor.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`} />
                                </Button>
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedVendor(vendor);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredVendors.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        No vendors found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* View Vendor Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Vendor Details</DialogTitle>
            </DialogHeader>
            {selectedVendor && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Building2 className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-semibold text-lg">{selectedVendor.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedVendor.vendor_code}</p>
                  </div>
                  <Badge variant={selectedVendor.status === 'active' ? 'default' : 'secondary'} className="ml-auto">
                    {selectedVendor.status}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {selectedVendor.contact_person && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Contact Person</p>
                        <p className="text-sm font-medium">{selectedVendor.contact_person}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendor.phone && (
                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-sm font-medium">{selectedVendor.phone}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendor.email && (
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm font-medium">{selectedVendor.email}</p>
                      </div>
                    </div>
                  )}
                  {selectedVendor.address && (
                    <div className="flex items-start gap-2 col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="text-sm font-medium">{selectedVendor.address}</p>
                      </div>
                    </div>
                  )}
                </div>

                {vendorStats[selectedVendor.id] && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">${vendorStats[selectedVendor.id].totalPurchases.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Purchases</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">${vendorStats[selectedVendor.id].totalPaid.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Paid</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-500">${vendorStats[selectedVendor.id].outstanding.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                    </div>
                  </div>
                )}

                {selectedVendor.notes && (
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedVendor.notes}</p>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  Created: {format(new Date(selectedVendor.created_at), 'PPP')}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Vendor Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Vendor</DialogTitle>
            </DialogHeader>
            {selectedVendor && (
              <form onSubmit={handleUpdateVendor} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Vendor Name *</Label>
                  <Input id="edit_name" name="name" defaultValue={selectedVendor.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_person">Contact Person</Label>
                  <Input id="edit_contact_person" name="contact_person" defaultValue={selectedVendor.contact_person || ''} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_phone">Phone</Label>
                    <Input id="edit_phone" name="phone" type="tel" defaultValue={selectedVendor.phone || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input id="edit_email" name="email" type="email" defaultValue={selectedVendor.email || ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_address">Address</Label>
                  <Textarea id="edit_address" name="address" rows={2} defaultValue={selectedVendor.address || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_notes">Notes</Label>
                  <Textarea id="edit_notes" name="notes" rows={2} defaultValue={selectedVendor.notes || ''} />
                </div>
                <Button type="submit" className="w-full">Update Vendor</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Vendor</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              Are you sure you want to delete <strong>{selectedVendor?.name}</strong>? This action cannot be undone.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteVendor}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Vendors;
