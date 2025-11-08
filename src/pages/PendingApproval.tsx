import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, LogOut } from 'lucide-react';
import gafMediaLogo from '@/assets/gaf-media-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const PendingApproval = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // Check for roles periodically
    const checkRoles = async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (roles && roles.length > 0) {
        navigate('/dashboard');
      }
    };

    // Check immediately
    checkRoles();

    // Check every 5 seconds
    const interval = setInterval(checkRoles, 5000);

    return () => clearInterval(interval);
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={gafMediaLogo} alt="GAF MEDIA" className="h-20 w-auto" />
          </div>
          <CardTitle className="text-2xl font-bold">Account Pending Approval</CardTitle>
          <CardDescription>Your registration is being reviewed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your account has been created successfully! However, you need to wait for an administrator to approve your account and assign you appropriate roles before you can access the system.
            </AlertDescription>
          </Alert>

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              You will be automatically redirected once your account is approved.
            </p>
            <p className="text-sm text-muted-foreground">
              Logged in as: <span className="font-medium">{user?.email}</span>
            </p>
          </div>

          <Button 
            variant="outline" 
            className="w-full" 
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
