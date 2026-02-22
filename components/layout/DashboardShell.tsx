'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import {
  AppSidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@bfeai/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { BugReportWidget } from '@/components/bug-report/BugReportWidget';
import { useCredits } from '@/hooks/use-credits';

interface UserData {
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

interface DashboardShellProps {
  children: React.ReactNode;
}

// Inner component that uses the sidebar context
function DashboardContent({
  children,
  user,
  loading,
  isLoggingOut,
  handleSignOut,
}: {
  children: React.ReactNode;
  user: UserData | null;
  loading: boolean;
  isLoggingOut: boolean;
  handleSignOut: () => void;
}) {
  const pathname = usePathname();
  const credits = useCredits();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-indigo"></div>
      </div>
    );
  }

  return (
    <>
      {/* Sidebar */}
      <AppSidebar
        currentApp="dashboard"
        pathname={pathname}
        user={user}
        credits={credits ? { total: credits.total } : null}
        onLogout={handleSignOut}
        isLoggingOut={isLoggingOut}
        themeToggle={<ThemeToggle size="sm" syncToCookie compact />}
      />

      {/* Main Content */}
      <SidebarInset>
        {/* Mobile Header */}
        <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4 md:hidden">
          <SidebarTrigger className="-ml-1">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle sidebar</span>
          </SidebarTrigger>
          <div className="flex items-center gap-2">
            <img src="/brand/BFE_Icon_TRN.png" alt="BFEAI" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold">BFEAI</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            {/* Page Children */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              {children}
            </div>
          </div>
        </div>
        <BugReportWidget appSource="dashboard" />
      </SidebarInset>
    </>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        router.push('/login');
        return;
      }

      const sessionData = await response.json();
      if (!sessionData.authenticated) {
        router.push('/login');
        return;
      }

      // Fetch profile for more details
      const profileResponse = await fetch('/api/profile');
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        setUser({
          email: sessionData.user.email,
          fullName: profileData.full_name,
          avatarUrl: profileData.avatar_url,
        });
      } else {
        setUser({
          email: sessionData.user.email,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={true} style={{ '--sidebar-width-icon': '4rem' } as React.CSSProperties}>
      <DashboardContent
        user={user}
        loading={loading}
        isLoggingOut={isLoggingOut}
        handleSignOut={handleSignOut}
      >
        {children}
      </DashboardContent>
    </SidebarProvider>
  );
}
