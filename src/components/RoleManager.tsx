import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield } from 'lucide-react';

interface RoleManagerProps {
  userId: string;
  currentRoles: string[];
  onUpdate: () => void;
}

const AVAILABLE_ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-destructive' },
  { value: 'sales', label: 'Sales', color: 'bg-success' },
  { value: 'designer', label: 'Designer', color: 'bg-primary' },
  { value: 'print_operator', label: 'Print Operator', color: 'bg-accent' },
  { value: 'accountant', label: 'Accountant', color: 'bg-warning' },
  { value: 'board', label: 'Board', color: 'bg-secondary' },
];

export const RoleManager = ({ userId, currentRoles, onUpdate }: RoleManagerProps) => {
  const [open, setOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleToggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Delete all existing roles
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new roles
      if (selectedRoles.length > 0) {
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert(selectedRoles.map(role => ({ 
            user_id: userId, 
            role: role as 'admin' | 'sales' | 'designer' | 'print_operator' | 'accountant' | 'board'
          })));

        if (insertError) throw insertError;
      }

      toast({
        title: 'Success',
        description: 'Roles updated successfully',
      });

      setOpen(false);
      onUpdate();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Shield className="mr-2 h-4 w-4" />
          Manage Roles
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage User Roles</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {AVAILABLE_ROLES.map((role) => (
            <div key={role.value} className="flex items-center space-x-2">
              <Checkbox
                id={role.value}
                checked={selectedRoles.includes(role.value)}
                onCheckedChange={() => handleToggleRole(role.value)}
              />
              <Label
                htmlFor={role.value}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                <Badge className={role.color}>{role.label}</Badge>
              </Label>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
