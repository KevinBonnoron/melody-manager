import { Link, useLocation } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalSearchButton } from '@/components/atoms/global-search-button';
import { MusicPlayer } from '@/components/atoms/music-player';
import { NowPlaying } from '@/components/atoms/music-player/now-playing';
import { PlaybackStateSync } from '@/components/atoms/playback-state-sync';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuthUser } from '@/hooks/use-auth-user';
import { LibraryIndexProvider } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';
import { TaskNotifications } from '../atoms/task-notifications';
import { AppSidebar } from './app-sidebar';
import { BottomNav } from './bottom-nav';
import { PageHeaderProvider, usePageHeaderValue } from './page-header';

interface AppLayoutProps {
  children: ReactNode;
}

const routeTitles: Record<string, { titleKey: string; descriptionKey: string }> = {
  '/': { titleKey: 'HomePage.title', descriptionKey: 'HomePage.description' },
  '/library': { titleKey: 'LibraryPage.title', descriptionKey: 'LibraryPage.description' },
  '/shares': { titleKey: 'SharesPage.title', descriptionKey: 'SharesPage.description' },
  '/history': { titleKey: 'HistoryPage.title', descriptionKey: 'HistoryPage.description' },
  '/stats': { titleKey: 'StatsPage.title', descriptionKey: 'StatsPage.description' },
  '/admin/users': { titleKey: 'Admin.usersTitle', descriptionKey: 'Admin.usersDescription' },
  '/admin/settings': { titleKey: 'AdminSettings.title', descriptionKey: 'AdminSettings.description' },
  '/profile': { titleKey: 'ProfilePage.title', descriptionKey: 'ProfilePage.description' },
  '/search': { titleKey: 'SearchPage.title', descriptionKey: 'SearchPage.description' },
  '/sources': { titleKey: 'SourcesPage.title', descriptionKey: 'SourcesPage.description' },
};

export function AppLayout({ children }: AppLayoutProps) {
  // The bar reserves room whether the playback is here or on another device.
  const { track: currentTrack, isRemote } = useNowPlaying();
  // A floating player is not across the bottom any more, so the strip it used
  // to need is a screenful of nothing under a short page. Mobile keeps it
  // either way: its mini-player lives in the dock, which does not float.
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  // The index has to cover the player bar and the sidebar too, not just the
  // page: the bar resolves its cover and its artist through it. It reads four
  // collections at once and a collection that has not synced yet suspends, so
  // the boundary sits above it; without one the whole tree rendered nothing.
  return (
    <Suspense fallback={null}>
      <LibraryIndexProvider>
        <SidebarProvider>
          <PageHeaderProvider>
            <AppSidebar />
            <SidebarInset className="px-3 md:px-4">
              <AppHeader />
              {/* The room the player bar needs, in one place: every page used to add
              its own on top, which left a screenful of nothing under short
              pages and a scrollbar that scrolled through it. */}
              {/* A div, not a main: SidebarInset is already the page's main landmark. */}
              <div className={cn('flex-1 pt-3 md:pt-4', currentTrack || isRemote ? 'pb-36 md:pb-36' : 'pb-20 md:pb-8')}>{children}</div>
            </SidebarInset>
            <BottomNav onExpand={() => setNowPlayingOpen(true)} />
            <MusicPlayer onExpand={() => setNowPlayingOpen(true)} />
            <GlobalSearchButton />
            <NowPlaying open={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
            <PlaybackStateSync />
          </PageHeaderProvider>
        </SidebarProvider>
      </LibraryIndexProvider>
    </Suspense>
  );
}

function AppHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const routeInfo = routeTitles[location.pathname] || routeTitles[location.pathname.replace(/\/$/, '')];
  const pageHeader = usePageHeaderValue();
  const title = routeInfo ? t(routeInfo.titleKey) : pageHeader?.title;
  const description = routeInfo ? t(routeInfo.descriptionKey) : pageHeader?.description;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 sticky top-0 z-20 overflow-hidden bg-gradient-to-b from-background to-background/80 backdrop-blur-[20px] border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <SidebarTrigger className="shrink-0 md:hidden" />
        {title && (
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold tracking-[-0.015em] leading-tight truncate">{title}</h2>
            {description && <p className="text-xs text-muted-foreground hidden sm:block truncate">{description}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TaskNotifications />
        <ThemeToggle />
        <ProfileAvatarLink />
      </div>
    </header>
  );
}

// Mobile has no sidebar on screen, so the profile would sit two taps away
// behind the drawer. The design puts the avatar in the top bar instead.
function ProfileAvatarLink() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const avatarUrl = user?.avatar ? `${config.pb.url}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : undefined;
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <Link to="/profile" className="md:hidden" aria-label={user?.name || t('ProfilePage.title')}>
      <Avatar className="h-7 w-7">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={user?.name || ''} />}
        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-[10px]">{initials ?? <User className="h-3.5 w-3.5" />}</AvatarFallback>
      </Avatar>
    </Link>
  );
}
