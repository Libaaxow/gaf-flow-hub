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
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import gafMediaLogo from '@/assets/gaf-media-logo.png';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/customer-history', label: 'Order History', icon: History },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/users', label: 'Users', icon: UserCog },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const Layout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setProfile(data);
        });
    }
  }, [user]);

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
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
          <nav className="flex-1 space-y-2 p-4">
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
                  <nav className="flex-1 space-y-2 p-4">
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
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="max-w-full overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
