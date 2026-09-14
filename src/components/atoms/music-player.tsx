import { ListMusic, Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useRemotePlayback } from '@/hooks/use-remote-playback';
import { useTransferPlayback } from '@/hooks/use-transfer-playback';
import { isNetworkDevice, type Track } from '@/shared';
import { DeviceSelector } from './music-player/device-selector';
import { FormatSelector } from './music-player/format-selector';
import { MuteButton } from './music-player/mute-button';
import { PlaybackControls } from './music-player/playback-controlts';
import { ProgressBar } from './music-player/progress-bar';
import { QueueSheet } from './music-player/queue-sheet';
import { SimpleProgressBar } from './music-player/simple-progress-bar';
import { TrackInfo } from './music-player/track-info';

const REMOTE_VOLUME_DEBOUNCE_MS = 150;

export function MusicPlayer({ onExpand }: { onExpand: () => void }) {
  const { t } = useTranslation();
  const { currentTrack, currentTime, isPlaying, isLoading, seek, volume, setVolume, activeDevice, switchDevice, playHere, audioFormat, setAudioFormat, queue } = useMusicPlayer();
  const remote = useRemotePlayback();
  const { isRemote } = useNowPlaying();
  const transferPlayback = useTransferPlayback();
  // A remote change is only reflected once the device has reported it back, so
  // the slider follows the hand until then rather than the round trip.
  const [pendingVolume, setPendingVolume] = useState<number | null>(null);
  const volumeCommandRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteVolume = remote?.volume;
  useEffect(() => {
    if (pendingVolume === null || remoteVolume === undefined) {
      return;
    }

    if (Math.abs(remoteVolume - pendingVolume) < 0.01) {
      setPendingVolume(null);
      return;
    }

    const timer = setTimeout(() => setPendingVolume(null), 2000);
    return () => clearTimeout(timer);
  }, [remoteVolume, pendingVolume]);

  const level = isRemote && remote ? (pendingVolume ?? remote.volume) : volume;
  const isMuted = level === 0;
  const [previousVolume, setPreviousVolume] = useState(1.0);
  const [queueOpen, setQueueOpen] = useState(false);

  // The pending command closes over the device it was made for, so it has to go
  // when that device does, and when the bar does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the identity of the device is what invalidates the pending command, not the object
  useEffect(() => {
    return () => {
      if (volumeCommandRef.current) {
        clearTimeout(volumeCommandRef.current);
        volumeCommandRef.current = null;
      }
    };
  }, [isRemote, remote?.device.id]);

  const applyVolume = (next: number) => {
    if (isRemote && remote) {
      // The slider emits a change per pixel; the display follows every one of
      // them, the device is only told where the drag settled.
      setPendingVolume(next);
      if (volumeCommandRef.current) {
        clearTimeout(volumeCommandRef.current);
      }

      volumeCommandRef.current = setTimeout(() => remote.setVolume(next), REMOTE_VOLUME_DEBOUNCE_MS);
      return;
    }

    setVolume(next);
  };

  const handleVolumeToggle = () => {
    if (isMuted) {
      applyVolume(previousVolume > 0 ? previousVolume : 0.5);
    } else {
      if (level > 0) {
        setPreviousVolume(level);
      }

      applyVolume(0);
    }
  };

  const track = (isRemote ? remote?.track : currentTrack) ?? null;
  // A device reporting a track this client has not loaded yet still has to be
  // stoppable, so the bar follows what is playing, not what is known about it.
  const holder = isRemote ? remote?.device : null;
  if (!track && !holder) {
    return null;
  }

  // WaveSurfer reads its progress off the local audio element, which sits idle
  // whenever something else is doing the playing. A speaker or another browser
  // reports where it is instead, and that is what the bar has to follow.
  const onAnotherClient = isRemote && remote ? { trackId: remote.track?.id, currentTime: remote.currentTime, duration: remote.duration, playing: remote.isPlaying, onSeek: remote.seek } : null;
  const onSpeaker = activeDevice && isNetworkDevice(activeDevice) && track ? { trackId: track.id, currentTime, duration: track.duration, playing: isPlaying, loading: isLoading, onSeek: seek } : null;
  const reported = onAnotherClient ?? onSpeaker;

  // On mobile, the mini-player is integrated into the BottomNav dock, hide this component
  return (
    <div className="hidden md:block fixed bottom-3 left-16 peer-data-[state=expanded]:left-[17rem] right-4 overflow-hidden rounded-xl border border-primary-border bg-card/[0.92] backdrop-blur-[24px] backdrop-saturate-[1.2] shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-[left] duration-200 ease-linear z-40">
      <div className="w-full px-3.5 py-2.5">
        <div className="flex flex-col gap-2">
          {/* Full-width progress bar on top */}
          {reported ? <SimpleProgressBar {...reported} /> : <ProgressBar />}

          {/* Left and right share what the transport does not take, so the
              transport stays centred and never has to give ground: letting it
              shrink past its buttons is what put them on top of the title. */}
          <div className="flex items-center gap-2 min-w-0 lg:gap-4">
            {/* LEFT, track info. It takes its whole half, which is what keeps
                the transport centred, and a title only gives way once it truly
                runs out of room. */}
            <div className="flex min-w-0 flex-1">
              <TrackInfo track={track} fallbackTitle={holder?.name} />
            </div>

            {/* CENTER, transport controls */}
            <div className="flex flex-none justify-center">
              <PlaybackControls remote={isRemote && remote ? { isPlaying: remote.isPlaying, track: remote.track, togglePlayPause: remote.togglePlayPause, playNext: remote.playNext, playPrevious: remote.playPrevious } : undefined} />
            </div>

            {/* RIGHT, device, format, queue, volume. Everything but the device
                gives way as the window narrows, widest use first. */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 justify-end">
              <DeviceSelector activeDevice={activeDevice} onDeviceChange={switchDevice} remote={isRemote ? remote?.device : undefined} onSelectClient={transferPlayback} onPlayHere={isRemote && remote?.track ? () => playHere(remote.track as Track, remote.currentTime, remote.device) : undefined} />
              <div className="hidden xl:block">
                <FormatSelector audioFormat={audioFormat} onFormatChange={setAudioFormat} />
              </div>

              {track && (
                <Button variant="ghost" size="icon" className="hidden h-8 w-8 lg:inline-flex" onClick={onExpand} title={t('NowPlaying.title')} aria-label={t('NowPlaying.title')}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}

              <Button variant="ghost" size="icon" className="relative h-8 w-8 shrink-0" onClick={() => setQueueOpen(true)} title={t('NowPlaying.queue')} aria-label={t('NowPlaying.queue')}>
                <ListMusic className="h-4 w-4" />
                {queue.length > 0 && <span className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-muted text-[9px] font-medium tabular-nums flex items-center justify-center text-muted-foreground">{queue.length > 99 ? '99+' : queue.length}</span>}
              </Button>

              <div className="hidden items-center gap-1.5 pl-2 lg:flex">
                <MuteButton onClick={handleVolumeToggle} isMuted={isMuted} volume={level} />
                <Slider
                  value={[level * 100]}
                  max={100}
                  step={1}
                  onValueChange={([value]) => {
                    const nextVolume = value / 100;
                    applyVolume(nextVolume);
                    if (nextVolume > 0) {
                      setPreviousVolume(nextVolume);
                    }
                  }}
                  className="w-16 xl:w-20"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </div>
  );
}
