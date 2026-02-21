'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Menu } from 'lucide-react';

import {
  AppSidebar,
  Button,
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
  const router = useRouter();
  const credits = useCredits();

  const firstName =
    user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || 'friend';

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
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            {/* Welcome Header */}
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Manage your account, billing, and connected apps.
                </p>
                <h1 className="text-2xl font-bold text-foreground md:text-3xl lg:text-4xl">
                  Welcome back, {firstName}.
                </h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="h-11 gap-2 rounded-lg bg-brand-indigo text-white shadow-lg shadow-brand-indigo/40 hover:bg-brand-indigo/90"
                  onClick={() => router.push('/apps')}
                >
                  <Sparkles className="h-4 w-4" />
                  Explore apps
                </Button>
              </div>
            </div>

            {/* Page Children */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              {children}
            </div>
          </div>
        </main>
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
      <div className="flex min-h-screen w-full bg-background">
        <DashboardContent
          user={user}
          loading={loading}
          isLoggingOut={isLoggingOut}
          handleSignOut={handleSignOut}
        >
          {children}
        </DashboardContent>
      </div>
    </SidebarProvider>
  );
}
