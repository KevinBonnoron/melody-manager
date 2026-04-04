import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { PocketBaseProvider } from 'pocketbase-react-hooks';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MusicPlayerProvider } from '@/contexts/music-player-context';
import { TaskProvider } from '@/contexts/task-context';
import { pb } from '@/lib/pocketbase';
import { ThemeProvider } from '@/providers/ThemeProvider';

function RootComponent() {
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith('/login') || location.pathname.startsWith('/register') || location.pathname.startsWith('/reset-password') || location.pathname.startsWith('/setup') || location.pathname.startsWith('/onboarding');
  const showAppLayout = !isAuthPage && pb.authStore.isValid;
  return (
    <PocketBaseProvider pocketBase={pb}>
      <ThemeProvider defaultTheme="dark" storageKey="melody-manager-theme">
        <TooltipProvider>
          <TaskProvider>
            <MusicPlayerProvider>
              {showAppLayout ? (
                <AppLayout>
                  <Outlet />
                </AppLayout>
              ) : (
                <div className="relative min-h-screen">
                  <div className="absolute top-4 right-4 z-50">
                    <ThemeToggle />
                  </div>
                  <Outlet />
                </div>
              )}
            </MusicPlayerProvider>
          </TaskProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </PocketBaseProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
