import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AddMusicButton } from '@/components/atoms/add-music-button';
import { GlobalSearchButton } from '@/components/atoms/global-search-button';
import { MusicPlayer } from '@/components/atoms/music-player';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { BackButton } from '../atoms/back-button';
import { TaskNotifications } from '../atoms/task-notifications';
import { AppSidebar } from './app-sidebar';
import { BottomNav } from './bottom-nav';

interface AppLayoutProps {
  children: ReactNode;
}

const routeTitles: Record<string, { titleKey: string; descriptionKey: string }> = {
  '/': { titleKey: 'HomePage.title', descriptionKey: 'HomePage.description' },
  '/library': { titleKey: 'LibraryPage.title', descriptionKey: 'LibraryPage.description' },
  '/shares': { titleKey: 'SharesPage.title', descriptionKey: 'SharesPage.description' },
  '/history': { titleKey: 'HistoryPage.title', descriptionKey: 'HistoryPage.description' },
  '/stats': { titleKey: 'StatsPage.title', descriptionKey: 'StatsPage.description' },
  '/admin': { titleKey: 'Admin.title', descriptionKey: 'Admin.description' },
  '/admin/users': { titleKey: 'Admin.usersTitle', descriptionKey: 'Admin.usersDescription' },
  '/admin/providers': { titleKey: 'Admin.providersTitle', descriptionKey: 'Admin.providersDescription' },
  '/profile': { titleKey: 'ProfilePage.title', descriptionKey: 'ProfilePage.description' },
  '/providers': { titleKey: 'ProvidersPage.title', descriptionKey: 'ProvidersPage.description' },
};

export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const { currentTrack } = useMusicPlayer();
  const location = useLocation();
  const routeInfo = routeTitles[location.pathname] || routeTitles[location.pathname.replace(/\/$/, '')];
  const isRootPath = !!routeInfo;
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="px-3 md:px-4">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 sticky top-0 bg-background z-20 overflow-hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="hidden md:inline-flex" />
            {!isRootPath && <BackButton />}
            {routeInfo && (
              <div>
                <h2 className="text-xl font-bold leading-tight">{t(routeInfo.titleKey)}</h2>
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
        <main className={`flex-1 pt-3 md:pt-4 ${currentTrack ? 'pb-56 md:pb-48' : 'pb-20 md:pb-8'}`}>{children}</main>
      </SidebarInset>
      <BottomNav />
      <MusicPlayer />
    </SidebarProvider>
  );
}
