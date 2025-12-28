import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  BarChart3,
  LogOut,
  Menu,
  UserCog,
  Settings,
  History,
  FileText,
  Receipt,
  ExternalLink,
  Building2,
  Package,
  Wallet,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import gafMediaLogo from '@/assets/gaf-media-logo.png';
import { supabase } from '@/integrations/supabase/client';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles?: string[]; // If undefined, visible to all roles
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/vendors', label: 'Vendors', icon: Building2, roles: ['admin', 'accountant', 'board'] },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: FileText, roles: ['admin', 'accountant', 'board'] },
  { href: '/vendor-bills', label: 'Vendor Bills', icon: Receipt, roles: ['admin', 'accountant', 'board'] },
  { href: '/vendor-payments', label: 'Vendor Payments', icon: Receipt, roles: ['admin', 'accountant', 'board'] },
  { href: '/vendor-reports', label: 'Vendor Reports', icon: BarChart3, roles: ['admin', 'accountant', 'board'] },
  { href: '/orders', label: 'Orders', icon: ShoppingCart, roles: ['admin', 'accountant', 'designer', 'print_operator', 'marketing'] },
  { href: '/quotations', label: 'Quotations', icon: FileText, roles: ['admin', 'accountant', 'board'] },
  { href: '/customer-history', label: 'Order History', icon: History, roles: ['admin', 'accountant'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'accountant', 'board'] },
  { href: '/customer-reports', label: 'Customer Reports', icon: FileText, roles: ['admin', 'accountant', 'board'] },
  { href: '/financial-reports', label: 'Financial Reports', icon: Receipt, roles: ['admin', 'accountant', 'board'] },
  { href: '/beginning-balances', label: 'Beginning Balances', icon: Wallet, roles: ['admin', 'accountant'] },
  { href: '/wallet-management', label: 'Wallet Management', icon: Wallet, roles: ['admin'] },
  { href: '/tax-settings', label: 'Tax Settings', icon: Settings, roles: ['admin'] },
  { href: '/users', label: 'Users', icon: UserCog, roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const Layout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      // Fetch profile
      supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setProfile(data);
        });

      // Fetch user role
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setUserRole(data.role);
        });
    }
  }, [user]);

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter(item => {
    // If no roles specified, visible to all
    if (!item.roles) return true;
    // If user has no role yet, hide role-restricted items
    if (!userRole) return false;
    // Check if user role is in allowed roles
    return item.roles.includes(userRole);
  });

  const NavLinks = () => (
    <>
      {filteredNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.href;
        
        return (
          <Link key={item.href} to={item.href}>
            <Button
              variant={isActive ? 'default' : 'ghost'}
              className="w-full justify-start"
            >
              <Icon className="mr-2 h-4 w-4" />
              {item.label}
            </Button>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r bg-card lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b p-6">
            <img src={gafMediaLogo} alt="GAF MEDIA" className="h-16 w-auto mb-2" />
            <p className="text-sm text-muted-foreground">Management System</p>
          </div>
          <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
            <NavLinks />
          </nav>
          <div className="border-t p-4 space-y-3">
            {profile && (
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                  <AvatarFallback>{profile.full_name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <p className="text-sm font-medium truncate">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            )}
            <a href="https://app.gafsom.com/auth" target="_blank" rel="noopener noreferrer" className="block">
              <Button
                variant="outline"
                className="w-full justify-start"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                System
              </Button>
            </a>
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:bg-destructive/10"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex flex-1 flex-col">
        <header className="border-b bg-card lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <img src={gafMediaLogo} alt="GAF MEDIA" className="h-10 w-auto" />
            <div className="flex items-center gap-2">
              {profile && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                  <AvatarFallback>{profile.full_name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-full flex-col">
                  <div className="border-b p-6">
                    <img src={gafMediaLogo} alt="GAF MEDIA" className="h-16 w-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Management System</p>
                  </div>
                  <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
                    <NavLinks />
                  </nav>
                  <div className="border-t p-4 space-y-3">
                    {profile && (
                      <div className="flex items-center gap-3 px-2 py-2">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
                          <AvatarFallback>{profile.full_name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col overflow-hidden">
                          <p className="text-sm font-medium truncate">{profile.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                    )}
                    <a href="https://app.gafsom.com/auth" target="_blank" rel="noopener noreferrer" className="block">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        System
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-destructive"
                      onClick={signOut}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 lg:p-8">
          <div className="max-w-full overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
