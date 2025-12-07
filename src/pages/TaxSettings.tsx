import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Settings, Percent, Save } from 'lucide-react';

const TaxSettings = () => {
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPercentage, setVatPercentage] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchSettings();
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (!user) return;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const userRoles = roles?.map(r => r.role) || [];
    setIsAdmin(userRoles.includes('admin'));
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tax_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setVatEnabled(data.vat_enabled);
        setVatPercentage(String(data.vat_percentage));
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast({ title: 'Error', description: 'Only admins can update tax settings', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('tax_settings')
        .update({
          vat_enabled: vatEnabled,
          vat_percentage: parseFloat(vatPercentage) || 0,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

      if (error) throw error;

      toast({ title: 'Success', description: 'Tax settings updated successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tax Settings</h1>
          <p className="text-muted-foreground">Configure VAT and tax options for your business</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Global VAT Configuration
            </CardTitle>
            <CardDescription>
              These settings apply to all new invoices, quotations, and purchase orders. 
              Individual transactions can override these defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="vat-enabled" className="text-base font-medium">Enable VAT</Label>
                <p className="text-sm text-muted-foreground">
                  Turn on to apply VAT to transactions by default
                </p>
              </div>
              <Switch
                id="vat-enabled"
                checked={vatEnabled}
                onCheckedChange={setVatEnabled}
                disabled={!isAdmin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat-percentage" className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Default VAT Percentage
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="vat-percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={vatPercentage}
                  onChange={(e) => setVatPercentage(e.target.value)}
                  className="w-32"
                  disabled={!isAdmin}
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Set to 0 for VAT-free transactions. This is the default rate that will be applied.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">Current Configuration</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">VAT Status:</span>
                  <span className={`ml-2 font-medium ${vatEnabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {vatEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rate:</span>
                  <span className="ml-2 font-medium">{vatPercentage}%</span>
                </div>
              </div>
            </div>

            {isAdmin ? (
              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground text-center p-4 bg-muted rounded-lg">
                Only administrators can modify tax settings
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VAT Guidelines for Somalia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              <strong>VAT-Free:</strong> Set percentage to 0% if your business is not required to charge VAT.
            </p>
            <p>
              <strong>VAT-Inclusive:</strong> Enable VAT and set the appropriate percentage. 
              Prices displayed will include VAT.
            </p>
            <p>
              <strong>Per-Transaction Override:</strong> You can enable or disable VAT on individual 
              invoices, quotations, and purchase orders regardless of global settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TaxSettings;
