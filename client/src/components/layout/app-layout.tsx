import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AddMusicButton } from '@/components/atoms/add-music-button';
import { GlobalSearchButton } from '@/components/atoms/global-search-button';
import { MusicPlayer } from '@/components/atoms/music-player';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BackButton } from '../atoms/back-button';
import { TaskNotifications } from '../atoms/task-notifications';
import { AppSidebar } from './app-sidebar';
import { BottomNav } from './bottom-nav';

interface AppLayoutProps {
  children: ReactNode;
}

const routeTitles: Record<string, { titleKey: string; descriptionKey: string }> = {
  '/': { titleKey: 'TrackPage.title', descriptionKey: 'TrackPage.description' },
  '/albums': { titleKey: 'AlbumsPage.title', descriptionKey: 'AlbumsPage.description' },
  '/artists': { titleKey: 'ArtistsPage.title', descriptionKey: 'ArtistsPage.description' },
  '/favorites': { titleKey: 'FavoritesPage.title', descriptionKey: 'FavoritesPage.description' },
  '/shares': { titleKey: 'SharesPage.title', descriptionKey: 'SharesPage.description' },
  '/admin': { titleKey: 'Admin.title', descriptionKey: 'Admin.description' },
  '/profile': { titleKey: 'ProfilePage.title', descriptionKey: 'ProfilePage.description' },
};

export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const routeInfo = routeTitles[location.pathname] || routeTitles[location.pathname.replace(/\/$/, '')];
  const isRootPath = !!routeInfo;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:px-8 sticky top-0 bg-background z-20">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="hidden md:inline-flex" />
            {!isRootPath && <BackButton />}
            {routeInfo && (
              <div>
                <h2 className="text-lg font-bold leading-tight">{t(routeInfo.titleKey)}</h2>
                <p className="text-xs text-muted-foreground hidden sm:block">{t(routeInfo.descriptionKey)}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <GlobalSearchButton />
            <AddMusicButton />
            <TaskNotifications />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-32 md:pb-8">{children}</main>
      </SidebarInset>
      <BottomNav />
      <MusicPlayer />
    </SidebarProvider>
  );
}
