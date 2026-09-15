import { Music2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useRemotePlayback } from '@/hooks/use-remote-playback';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import { NextButton } from './next-button';
import { PlayButton } from './play-button';
import { PreviousButton } from './previous-button';
import { queueBounds } from './queue-bounds';

/**
 * What the picture-in-picture window shows. Deliberately not the bar: that one
 * opens dropdowns and sheets through Radix portals, which mount into this
 * document's body rather than the window's, and its links would navigate the
 * tab behind it. A cover, a title, the transport and the position are what a
 * window of this size is for.
 */
export function PipPlayer() {
  const { t } = useTranslation();
  const player = useMusicPlayer();
  const { track, isPlaying, isRemote } = useNowPlaying();
  const remote = useRemotePlayback();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  // The window drives whatever holds the playback, as the mobile dock does: a
  // speaker or another tab is playing just as much as this browser is.
  const control =
    isRemote && remote
      ? { toggle: remote.togglePlayPause, next: remote.playNext, previous: remote.playPrevious, seek: remote.seek, time: remote.currentTime, duration: remote.duration, loading: false }
      : { toggle: player.togglePlayPause, next: player.playNext, previous: player.playPrevious, seek: player.seek, time: player.currentTime, duration: track?.duration ?? 0, loading: player.isLoading };

  const { canGoNext, canGoPrevious } = queueBounds({ queue: player.queue, trackId: track?.id, repeatMode: player.repeatMode, remote: isRemote });
  const album = track ? albumsById.get(track.album) : undefined;
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const artists = artistNames(track?.artists, artistsById);
  const progress = control.duration > 0 ? Math.min(100, Math.max(0, (control.time / control.duration) * 100)) : 0;

  const seekFromClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (control.duration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    control.seek(Math.min(control.duration, Math.max(0, ratio * control.duration)));
  };

  return (
    <div className="flex h-screen w-full items-center gap-3 bg-background p-3 text-foreground">
      <div className="aspect-square h-full shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
        {coverUrl ? (
          <img src={coverUrl} alt={track?.title ?? ''} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music2 className="h-8 w-8 text-primary/60" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{track?.title ?? t('NowPlaying.title')}</p>
          <p className="truncate text-xs text-muted-foreground">{artists}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          <PreviousButton disabled={!canGoPrevious} onPrevious={control.previous} />
          <PlayButton isPlaying={isPlaying} isLoading={control.loading} onToggle={control.toggle} />
          <NextButton disabled={!canGoNext} onNext={control.next} />
        </div>

        <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatDuration(control.time)}</span>
          {/* A button, so the position can be changed from the keyboard too and
              so a click lands on something meant to be clicked. */}
          <button type="button" onClick={seekFromClick} aria-label={t('MusicPlayer.seek')} title={t('MusicPlayer.seek')} className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </button>
          <span>{formatDuration(control.duration)}</span>
        </div>
      </div>
    </div>
  );
}
