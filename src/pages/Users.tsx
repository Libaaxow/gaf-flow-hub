import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { UserPlus, Clock, CheckCircle, Trash2, KeyRound, Edit2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RoleManager } from '@/components/RoleManager';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface UserWithRoles {
  id: string;
  full_name: string;
  email: string;
  commission_percentage: number;
  phone?: string;
  whatsapp_number?: string;
  roles: string[];
}

const Users = () => {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithRoles | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if current user is admin
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const isAdmin = userRoles?.some(r => r.role === 'admin');

      // Fetch profiles - all if admin, only current user if not
      let profilesQuery = supabase.from('profiles').select('*');
      
      if (!isAdmin) {
        profilesQuery = profilesQuery.eq('id', user.id);
      }

      const { data: profiles } = await profilesQuery;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('*');

      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        roles: roles?.filter(r => r.user_id === profile.id).map(r => r.role) || []
      })) || [];

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('full_name') as string;
    const phone = formData.get('phone') as string;

    try {
      // Create user account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Update phone if provided
        if (phone) {
          await supabase
            .from('profiles')
            .update({ phone })
            .eq('id', data.user.id);
        }

        toast({
          title: 'Success',
          description: 'User created successfully',
        });

        form.reset();
        setIsCreateDialogOpen(false);
        fetchUsers();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Delete user roles first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      // Note: Deleting from auth.users requires admin API which we can't do from client
      // The admin should use the backend dashboard to fully delete the auth user

      toast({
        title: 'Success',
        description: 'User removed from system',
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const newPassword = formData.get('new_password') as string;

    if (!resetPasswordUser) return;

    try {
      // Send password recovery email
      const { error } = await supabase.auth.resetPasswordForEmail(
        resetPasswordUser.email,
        {
          redirectTo: `${window.location.origin}/auth`,
        }
      );

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Password reset email sent to user',
      });

      form.reset();
      setIsPasswordDialogOpen(false);
      setResetPasswordUser(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    if (!editingUser) return;

    const fullName = formData.get('full_name') as string;
    const phone = formData.get('phone') as string;
    const whatsappNumber = formData.get('whatsapp_number') as string;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone || null,
          whatsapp_number: whatsappNumber || null,
        })
        .eq('id', editingUser.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      form.reset();
      setIsEditDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateCommission = async (userId: string, percentage: number) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ commission_percentage: percentage })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Commission percentage updated',
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-destructive',
      sales: 'bg-success',
      designer: 'bg-primary',
      print_operator: 'bg-accent',
      accountant: 'bg-warning',
    };
    return colors[role] || 'bg-secondary';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading users...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const pendingUsers = users.filter(user => user.roles.length === 0);
  const activeUsers = users.filter(user => user.roles.length > 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">Manage team members and roles</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input id="phone" name="phone" type="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_number">WhatsApp Number (with country code)</Label>
                  <Input 
                    id="whatsapp_number" 
                    name="whatsapp_number" 
                    type="tel" 
                    placeholder="+1234567890"
                  />
                  <p className="text-xs text-muted-foreground">Required for order notifications</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Initial Password</Label>
                  <Input id="password" name="password" type="password" required minLength={6} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create User</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {pendingUsers.length > 0 && (
          <Alert className="border-warning bg-warning/10">
            <Clock className="h-4 w-4" />
            <AlertTitle>Pending User Approvals</AlertTitle>
            <AlertDescription>
              {pendingUsers.length} user{pendingUsers.length > 1 ? 's' : ''} waiting for role assignment
            </AlertDescription>
          </Alert>
        )}

        {pendingUsers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Approvals ({pendingUsers.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingUsers.map((user) => (
                <Card key={user.id} className="border-warning">
                  <CardHeader>
                    <CardTitle className="text-lg">{user.full_name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Badge variant="outline" className="text-warning border-warning">
                      Waiting for approval
                    </Badge>
                    
                    <RoleManager
                      userId={user.id}
                      currentRoles={user.roles}
                      onUpdate={fetchUsers}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeUsers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Active Users ({activeUsers.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeUsers.map((user) => (
                <Card key={user.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{user.full_name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {user.whatsapp_number && (
                          <p className="text-xs text-muted-foreground mt-1">
                            WhatsApp: {user.whatsapp_number}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingUser(user);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setResetPasswordUser(user);
                            setIsPasswordDialogOpen(true);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {user.full_name}? This will remove their profile and roles from the system.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteUser(user.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <Badge key={role} className={getRoleBadgeColor(role)}>
                          {role.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                    
                    <RoleManager
                      userId={user.id}
                      currentRoles={user.roles}
                      onUpdate={fetchUsers}
                    />

                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-xs">Commission %</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={user.commission_percentage || 0}
                          className="flex-1"
                          onBlur={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value >= 0 && value <= 100) {
                              handleUpdateCommission(user.id, value);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {users.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No users found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                name="full_name"
                defaultValue={editingUser?.full_name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                value={editingUser?.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                name="phone"
                type="tel"
                defaultValue={editingUser?.phone || ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_whatsapp_number">WhatsApp Number (with country code)</Label>
              <Input
                id="edit_whatsapp_number"
                name="whatsapp_number"
                type="tel"
                placeholder="+1234567890"
                defaultValue={editingUser?.whatsapp_number || ''}
              />
              <p className="text-xs text-muted-foreground">Required for order notifications</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Update Profile</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Alert>
              <AlertDescription>
                A password reset email will be sent to {resetPasswordUser?.email}
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Send Reset Email</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Users;
