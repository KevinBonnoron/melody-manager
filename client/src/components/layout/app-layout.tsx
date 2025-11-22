import { useLocation } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddMusicDialog } from '@/components/atoms/add-music-dialog';
import { MusicPlayer } from '@/components/atoms/music-player';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BackButton } from '../atoms/back-button';
import { AppSidebar } from './app-sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isRootPath = location.pathname === '/' || location.pathname === '/albums' || location.pathname === '/artists' || location.pathname === '/favorites' || location.pathname === '/favorites/';
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const shouldBeOpen = window.innerWidth >= 1064;
      setSidebarOpen(shouldBeOpen);

      const handleResize = () => {
        setSidebarOpen(window.innerWidth >= 1064);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleSearchClick = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            {!isRootPath && <BackButton />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSearchClick}>
              <Plus className="h-4 w-4 mr-2" />
              {t('AppLayout.search')}
              <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-32 md:pb-8">{children}</main>
      </SidebarInset>
      <MusicPlayer />
      <AddMusicDialog />
    </SidebarProvider>
  );
}
