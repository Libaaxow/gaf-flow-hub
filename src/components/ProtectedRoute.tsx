import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [hasRoles, setHasRoles] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (user) {
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .then(({ data: roles }) => {
          setHasRoles(roles && roles.length > 0);
        });
    }
  }, [user]);

  if (loading || (user && hasRoles === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-32 w-32 animate-spin rounded-full border-b-2 border-t-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Allow access to pending-approval page even without roles
  if (location.pathname === '/pending-approval') {
    return <>{children}</>;
  }

  // Redirect to pending-approval if user has no roles
  if (!hasRoles) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <>{children}</>;
};
