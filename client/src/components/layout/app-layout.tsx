import { AddMusicDialog } from '@/components/atoms/add-music-dialog';
import { MusicPlayer } from '@/components/atoms/music-player';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BottomNav } from './bottom-nav';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useLocation } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { TaskNotifications } from '../atoms/task-notifications';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../atoms/back-button';
import { AppSidebar } from './app-sidebar';

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

  const handleSearchClick = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

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
            <Button variant="outline" size="sm" onClick={handleSearchClick}>
              <Plus className="h-4 w-4 mr-2" />
              {t('AppLayout.search')}
              <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
            <TaskNotifications />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-32 md:pb-8">{children}</main>
      </SidebarInset>
      <BottomNav />
      <MusicPlayer />
      <AddMusicDialog />
    </SidebarProvider>
  );
}
