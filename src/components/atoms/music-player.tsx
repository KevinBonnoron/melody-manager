import { ListMusic, Maximize2, PictureInPicture2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useDocumentPip } from '@/hooks/use-document-pip';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useRemotePlayback } from '@/hooks/use-remote-playback';
import { useTransferPlayback } from '@/hooks/use-transfer-playback';
import { cn } from '@/lib/utils';
import { isNetworkDevice, type Track } from '@/shared';
import { DeviceSelector } from './music-player/device-selector';
import { FormatSelector } from './music-player/format-selector';
import { MuteButton } from './music-player/mute-button';
import { PipPlayer } from './music-player/pip-player';
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
  const pip = useDocumentPip();
  const closePip = pip.close;
  const inWindow = Boolean(pip.pipWindow);
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
  const holder = isRemote ? remote?.device : null;
  const nothingToShow = !track && !holder;

  useEffect(() => {
    if (nothingToShow) {
      closePip();
    }
  }, [nothingToShow, closePip]);

  if (nothingToShow) {
    return null;
  }

  const onAnotherClient = isRemote && remote ? { trackId: remote.track?.id, currentTime: remote.currentTime, duration: remote.duration, playing: remote.isPlaying, onSeek: remote.seek } : null;
  const onSpeaker = activeDevice && isNetworkDevice(activeDevice) && track ? { trackId: track.id, currentTime, duration: track.duration, playing: isPlaying, loading: isLoading, onSeek: seek } : null;
  const reported = onAnotherClient ?? onSpeaker;

  return (
    <div className="hidden md:block @container fixed bottom-3 left-16 right-4 z-40 overflow-hidden rounded-xl border border-primary-border bg-card/[0.92] backdrop-blur-[24px] backdrop-saturate-[1.2] shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-[left] duration-200 ease-linear peer-data-[state=expanded]:left-[17rem]">
      {inWindow ? (
        <button type="button" onClick={closePip} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/40" title={t('MusicPlayer.closePip')}>
          <PictureInPicture2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t('MusicPlayer.playingInWindow')}</span>
          <span className="shrink-0 text-xs font-medium text-primary">{t('MusicPlayer.closePip')}</span>
        </button>
      ) : (
        <div className="w-full px-3.5 py-2.5">
          <div className="flex flex-col gap-2">
            {reported ? <SimpleProgressBar {...reported} /> : <ProgressBar />}

            <div className="flex items-center gap-2 min-w-0 @2xl:gap-4">
              <div className="flex min-w-0 flex-1">
                <TrackInfo track={track} fallbackTitle={holder?.name} />
              </div>

              <div className="flex flex-none justify-center">
                <PlaybackControls remote={isRemote && remote ? { isPlaying: remote.isPlaying, track: remote.track, togglePlayPause: remote.togglePlayPause, playNext: remote.playNext, playPrevious: remote.playPrevious } : undefined} />
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5 justify-end">
                <DeviceSelector
                  activeDevice={activeDevice}
                  onDeviceChange={(device) => {
                    if (device && isRemote && remote?.track) {
                      transferPlayback(device);
                      return;
                    }

                    switchDevice(device);
                  }}
                  remote={isRemote ? remote?.device : undefined}
                  onSelectClient={transferPlayback}
                  onPlayHere={isRemote && remote?.track ? () => playHere(remote.track as Track, remote.currentTime, remote.device) : undefined}
                />
                <div className="hidden @5xl:block">
                  <FormatSelector audioFormat={audioFormat} onFormatChange={setAudioFormat} />
                </div>

                {track && (
                  <Button variant="ghost" size="icon" className="hidden h-8 w-8 @xl:inline-flex" onClick={onExpand} title={t('NowPlaying.title')} aria-label={t('NowPlaying.title')}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                )}

                {pip.supported && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8 shrink-0', pip.pipWindow && 'bg-primary-soft text-primary hover:text-primary')}
                    onClick={() => (pip.pipWindow ? pip.close() : pip.open())}
                    title={pip.pipWindow ? t('MusicPlayer.closePip') : t('MusicPlayer.openPip')}
                    aria-label={pip.pipWindow ? t('MusicPlayer.closePip') : t('MusicPlayer.openPip')}
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </Button>
                )}

                <Button variant="ghost" size="icon" className="relative h-8 w-8 shrink-0" onClick={() => setQueueOpen(true)} title={t('NowPlaying.queue')} aria-label={t('NowPlaying.queue')}>
                  <ListMusic className="h-4 w-4" />
                  {queue.length > 0 && <span className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-muted text-[9px] font-medium tabular-nums flex items-center justify-center text-muted-foreground">{queue.length > 99 ? '99+' : queue.length}</span>}
                </Button>

                <div className="hidden items-center gap-1.5 pl-2 @2xl:flex">
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
                    className="w-16 @5xl:w-20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
      {pip.pipWindow && createPortal(<PipPlayer />, pip.pipWindow.document.body)}
    </div>
  );
}
