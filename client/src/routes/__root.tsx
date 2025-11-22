import { AppLayout } from '@/components/layout/app-layout';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MusicPlayerProvider } from '@/contexts/music-player-context';
import { pb } from '@/lib/pocketbase';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { PocketBaseProvider } from 'pocketbase-react-hooks';
import { Toaster } from 'sonner';

function RootComponent() {
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith('/login') || location.pathname.startsWith('/register') || location.pathname.startsWith('/reset-password') || location.pathname.startsWith('/setup');

  return (
    <PocketBaseProvider pocketBase={pb}>
      <ThemeProvider defaultTheme="dark" storageKey="melody-manager-theme">
        <TooltipProvider>
          {isAuthPage ? (
            <div className="relative min-h-screen">
              <div className="absolute top-4 right-4 z-50">
                <ThemeToggle />
              </div>
              <Outlet />
            </div>
          ) : (
            <MusicPlayerProvider>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </MusicPlayerProvider>
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </PocketBaseProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
