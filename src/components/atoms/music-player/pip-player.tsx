import { Music2 } from 'lucide-react';
import { useState } from 'react';
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
  // The control reports every step it passes through, and on a speaker each one
  // is a request over the network, so the thumb follows the hand and the seek
  // is sent once, on release.
  const [scrub, setScrub] = useState<number | null>(null);
  // A range needs a span even before a duration is known, and a value inside it.
  const seekMax = Math.max(control.duration, 1);
  const position = Math.min(Math.max(scrub ?? control.time, 0), seekMax);
  const progress = control.duration > 0 ? (position / control.duration) * 100 : 0;

  const commitScrub = () => {
    if (scrub !== null) {
      control.seek(position);
      setScrub(null);
    }
  };

  // One row of cover, title and transport, with the position spanning the whole
  // width under it. A square cover as tall as the window took a third of its
  // width and left the rest crushed: in a strip this size the artwork is a
  // marker, not the subject.
  return (
    <div className="flex h-screen w-full flex-col justify-center gap-1.5 bg-background px-3 py-2 text-foreground">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-primary/20 to-accent/20">
          {coverUrl ? (
            <img src={coverUrl} alt={track?.title ?? ''} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 className="h-5 w-5 text-primary/60" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{track?.title ?? t('NowPlaying.title')}</p>
          <p className="truncate text-xs leading-tight text-muted-foreground">{artists}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <PreviousButton disabled={!canGoPrevious} onPrevious={control.previous} />
          <PlayButton isPlaying={isPlaying} isLoading={control.loading} onToggle={control.toggle} />
          <NextButton disabled={!canGoNext} onNext={control.next} />
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
        <span>{formatDuration(position)}</span>
        {/* A range, not a styled div: the arrow keys, Home and End come with
            it, and so does the position read out to a screen reader. */}
        <input
          type="range"
          min={0}
          max={seekMax}
          step={1}
          value={position}
          disabled={control.duration <= 0}
          onChange={(event) => setScrub(event.target.valueAsNumber)}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          aria-label={t('MusicPlayer.seek')}
          aria-valuetext={`${formatDuration(position)} / ${formatDuration(control.duration)}`}
          style={{ background: `linear-gradient(to right, var(--primary) ${progress}%, var(--muted) ${progress}%)` }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
        <span>{formatDuration(control.duration)}</span>
      </div>
    </div>
  );
}
