import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RoleManager } from '@/components/RoleManager';

interface UserWithRoles {
  id: string;
  full_name: string;
  email: string;
  commission_percentage: number;
  roles: string[];
}

const Users = () => {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">Manage team members and roles</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <CardTitle className="text-lg">{user.full_name}</CardTitle>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <Badge key={role} className={getRoleBadgeColor(role)}>
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                  {user.roles.length === 0 && (
                    <Badge variant="outline">No roles assigned</Badge>
                  )}
                </div>
                
                <RoleManager
                  userId={user.id}
                  currentRoles={user.roles}
                  onUpdate={fetchUsers}
                />

                {user.roles.includes('sales') && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs">Commission %</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={user.commission_percentage}
                        className="flex-1"
                        onBlur={(e) => handleUpdateCommission(user.id, parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {users.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No users found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Users;
