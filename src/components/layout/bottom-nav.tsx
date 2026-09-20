import { Link, useLocation } from '@tanstack/react-router';
import { History, Home, Library, MonitorSpeaker, Music2, Pause, Play, Search, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { cn } from '@/lib/utils';

export function BottomNav({ onExpand }: { onExpand: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { togglePlayPause, playNext, currentTime, activeDevice } = useMusicPlayer();
  const { track: currentTrack, isPlaying, isRemote } = useNowPlaying();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  const control = { toggle: togglePlayPause, next: playNext, time: currentTime };

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }

    return location.pathname.startsWith(href);
  };

  const tabs = [
    { href: '/', icon: Home, label: t('AppSidebar.home') },
    { href: '/library', icon: Library, label: t('AppSidebar.library') },
    { href: '/search', icon: Search, label: t('AppSidebar.search') },
    { href: '/history', icon: History, label: t('AppSidebar.history') },
  ];

  const album = currentTrack ? albumsById.get(currentTrack.album) : undefined;
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const duration = currentTrack?.duration ?? 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (control.time / duration) * 100)) : 0;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/[0.96] backdrop-blur-[24px] backdrop-saturate-[1.2] border-t border-primary-border shadow-[0_-8px_24px_rgba(0,0,0,0.3)] md:hidden">
      {currentTrack && (
        <div className="border-b border-border/50">
          <div className="h-[2px] w-full bg-muted">
            <div className={cn('h-full bg-primary', isPlaying && 'transition-[width] duration-1000 ease-linear')} style={{ width: `${progress}%` }} />
          </div>

          <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 px-2 py-2">
            <button type="button" onClick={onExpand} className="col-span-2 grid grid-cols-[auto_1fr] items-center gap-2.5 text-left" aria-label={t('NowPlaying.title')}>
              <div className="h-10 w-10 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 shrink-0">
                {coverUrl ? (
                  <img src={coverUrl} alt={currentTrack.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Music2 className="h-4 w-4 text-primary/60" />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate leading-tight">{currentTrack.title}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                  {isRemote && <MonitorSpeaker className="h-3 w-3 shrink-0 text-primary" />}
                  <span className="truncate">{isRemote && activeDevice ? activeDevice.name : artistNames(currentTrack.artists, artistsById)}</span>
                </p>
              </div>
            </button>

            <button type="button" className="h-9 w-9 flex items-center justify-center text-muted-foreground" onClick={control.next} aria-label={t('MusicPlayer.next')}>
              <SkipForward className="h-4 w-4" />
            </button>

            <button type="button" className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_3px_10px_var(--primary-glow)] shrink-0" onClick={control.toggle} aria-label={t('MusicPlayer.playPause')}>
              {isPlaying ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px] ml-0.5" />}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);

          return (
            <Link key={tab.href} to={tab.href} className={cn('relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors', active ? 'text-primary' : 'text-muted-foreground')}>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b bg-primary" />}
              <Icon className="h-[19px] w-[19px]" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
