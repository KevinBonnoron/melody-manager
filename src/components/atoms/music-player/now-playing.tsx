import { ChevronDown, ListMusic, Loader2, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LikeButton } from '@/components/atoms/like-button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useTrackRatings } from '@/hooks/use-ratings';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getSourceColor } from '@/lib/source-colors';
import { DeviceSelector } from './device-selector';
import { ProgressBar } from './progress-bar';
import { QueueSheet } from './queue-sheet';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NowPlaying({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { isLoading, shuffle, repeatMode, toggleShuffle, toggleRepeat, seek, currentTime, playNext, playPrevious, togglePlayPause, activeDevice, playsHere, playhead } = useMusicPlayer();
  const { track, isPlaying, isRemote } = useNowPlaying();
  const { isLiked, toggleLike } = useTrackRatings();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !track) {
    return null;
  }

  const control = { togglePlayPause, playNext, playPrevious, seek, currentTime, duration: track.duration };
  const isLoadingHere = playsHere && isLoading;
  const album = albumsById.get(track.album);
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const sourceColor = getSourceColor(track.source);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true" aria-label={t('NowPlaying.title')}>
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 50% 0%, ${sourceColor}33 0%, transparent 60%)` }} />

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label={t('NowPlaying.close')}>
          <ChevronDown className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{isRemote && activeDevice ? t('RemotePlayback.playingOn', { device: activeDevice.name }) : t('NowPlaying.title')}</div>
          {album && <div className="truncate text-[12px] text-muted-foreground">{album.name}</div>}
        </div>
        <div className="h-9 w-9" />
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <div className="aspect-square w-full max-w-[min(340px,100%)] overflow-hidden rounded-2xl bg-muted shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
          {coverUrl ? (
            <img src={coverUrl} alt={track.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 className="h-16 w-16 text-primary/50" />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[420px] space-y-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight">{track.title}</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">{artistNames(track.artists, artistsById)}</p>
            </div>
            <LikeButton isLiked={isLiked(track.id)} toggleLike={() => toggleLike(track.id)} />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.08em]" style={{ background: `${sourceColor}22`, color: sourceColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sourceColor }} />
            {track.source}
          </span>

          <ProgressBar trackId={track.id} playhead={playhead} onSeek={control.seek} chapters={track.metadata?.chapters} />

          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={toggleShuffle} aria-pressed={shuffle} aria-label={t('NowPlaying.shuffle')} className={`grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-muted/50 ${shuffle ? 'text-primary' : 'text-muted-foreground'}`}>
              <Shuffle className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={control.playPrevious} aria-label={t('NowPlaying.previous')} className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-colors hover:bg-muted/50">
              <SkipBack className="h-[22px] w-[22px]" fill="currentColor" />
            </button>
            <button type="button" onClick={control.togglePlayPause} aria-label={t('NowPlaying.playPause')} className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_var(--primary-glow)] transition-transform hover:scale-105">
              {isLoadingHere ? <Loader2 className="h-7 w-7 animate-spin" /> : isPlaying ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="ml-1 h-7 w-7" fill="currentColor" />}
            </button>
            <button type="button" onClick={control.playNext} aria-label={t('NowPlaying.next')} className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-colors hover:bg-muted/50">
              <SkipForward className="h-[22px] w-[22px]" fill="currentColor" />
            </button>
            <button type="button" onClick={toggleRepeat} aria-label={t('NowPlaying.repeat')} className={`grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-muted/50 ${repeatMode !== 'none' ? 'text-primary' : 'text-muted-foreground'}`}>
              {repeatMode === 'one' ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border/60 pt-3">
            <DeviceSelector />
            <button type="button" onClick={() => setQueueOpen(true)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted/50 hover:text-foreground">
              <ListMusic className="h-4 w-4" />
              {t('NowPlaying.queue')}
            </button>
          </div>
        </div>
      </div>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} elevated />
    </div>
  );
}
