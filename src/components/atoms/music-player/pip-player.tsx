import { Music2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useRemotePlayback } from '@/hooks/use-remote-playback';
import { useVolumeControl } from '@/hooks/use-volume-control';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import { MuteButton } from './mute-button';
import { NextButton } from './next-button';
import { PlayButton } from './play-button';
import { PreviousButton } from './previous-button';
import { queueBounds } from './queue-bounds';

/** What the picture-in-picture window shows. */
export function PipPlayer() {
  const { t } = useTranslation();
  const player = useMusicPlayer();
  const { track, isPlaying, isRemote } = useNowPlaying();
  const remote = useRemotePlayback();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  const control =
    isRemote && remote
      ? { toggle: remote.togglePlayPause, next: remote.playNext, previous: remote.playPrevious, seek: remote.seek, time: remote.currentTime, duration: remote.duration, loading: false }
      : { toggle: player.togglePlayPause, next: player.playNext, previous: player.playPrevious, seek: player.seek, time: player.currentTime, duration: track?.duration ?? 0, loading: player.isLoading };

  const { canGoNext, canGoPrevious } = queueBounds({ queue: player.queue, trackId: track?.id, repeatMode: player.repeatMode, remote: isRemote });
  const album = track ? albumsById.get(track.album) : undefined;
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const artists = artistNames(track?.artists, artistsById);
  const volume = useVolumeControl();
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  // The window's own title, which the browser writes into a header the page
  // cannot style or remove. Naming the track there is the only use anyone can
  // make of that strip.
  useEffect(() => {
    const doc = hostRef.current?.ownerDocument;
    if (!doc) {
      return;
    }

    doc.title = track ? [track.title, artists].filter(Boolean).join(' — ') : t('NowPlaying.title');
  }, [track, artists, t]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what changes is what invalidates the scrub, and none of it is read here
  useEffect(() => {
    setScrub(null);
  }, [track?.id, isRemote, player.activeDevice?.id, remote?.device.id]);
  const seekMax = Math.max(control.duration, 1);
  const position = Math.min(Math.max(scrub ?? control.time, 0), seekMax);
  const progress = control.duration > 0 ? (position / control.duration) * 100 : 0;

  const commitScrub = () => {
    if (scrub !== null) {
      control.seek(position);
      setScrub(null);
    }
  };

  return (
    <div ref={hostRef} className="flex h-screen w-full flex-col justify-center gap-1.5 bg-background px-3 py-2 text-foreground">
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

        <div className="flex shrink-0 items-center gap-1 pl-1">
          <MuteButton onClick={volume.toggle} isMuted={volume.isMuted} volume={volume.level} />
          <Slider value={[volume.level * 100]} max={100} step={1} onValueChange={([value]) => volume.apply(value / 100)} className="w-16" />
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
        <span>{formatDuration(position)}</span>
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
