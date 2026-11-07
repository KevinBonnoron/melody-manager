import { ListMusic, Maximize2, PictureInPicture2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useDocumentPip } from '@/hooks/use-document-pip';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useVolumeControl } from '@/hooks/use-volume-control';
import { cn } from '@/lib/utils';
import { ControlDot } from './music-player/control-dot';
import { DeviceSelector } from './music-player/device-selector';
import { FormatSelector } from './music-player/format-selector';
import { MuteButton } from './music-player/mute-button';
import { PipPlayer } from './music-player/pip-player';
import { PlaybackControls } from './music-player/playback-controlts';
import { ProgressBar } from './music-player/progress-bar';
import { QueueSheet } from './music-player/queue-sheet';
import { TrackInfo } from './music-player/track-info';

export function MusicPlayer({ onExpand }: { onExpand: () => void }) {
  const { t } = useTranslation();
  const { currentTrack, seek, activeDevice, playhead, audioFormat, setAudioFormat, queue } = useMusicPlayer();
  const { isRemote } = useNowPlaying();
  const pip = useDocumentPip();
  const closePip = pip.close;
  const inWindow = Boolean(pip.pipWindow);
  const { level, isMuted, apply: applyVolume, toggle: handleVolumeToggle } = useVolumeControl();
  const [queueOpen, setQueueOpen] = useState(false);

  const track = currentTrack;
  const holder = isRemote ? activeDevice : null;
  const nothingToShow = !track && !holder;

  useEffect(() => {
    if (nothingToShow) {
      closePip();
    }
  }, [nothingToShow, closePip]);

  if (nothingToShow) {
    return null;
  }

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
            <ProgressBar chapters={track?.metadata?.chapters} trackId={track?.id} playhead={playhead} onSeek={seek} />

            <div className="flex items-center gap-2 min-w-0 @2xl:gap-4">
              <div className="flex min-w-0 flex-1">
                <TrackInfo track={track} fallbackTitle={holder?.name} />
              </div>

              <div className="flex flex-none justify-center">
                <PlaybackControls />
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-1.5 justify-end">
                <DeviceSelector />
                <div className="hidden @5xl:block">
                  <FormatSelector audioFormat={audioFormat} onFormatChange={setAudioFormat} />
                </div>

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

                <Button variant="ghost" size="icon" className="group relative h-8 w-8 shrink-0" data-state={queueOpen ? 'open' : 'closed'} onClick={() => setQueueOpen(true)} title={t('NowPlaying.queue')} aria-label={t('NowPlaying.queue')}>
                  <ListMusic className="h-4 w-4" />
                  <ControlDot />
                  {queue.length > 0 && <span className="absolute -top-1 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-muted text-[9px] font-medium tabular-nums flex items-center justify-center text-muted-foreground">{queue.length > 99 ? '99+' : queue.length}</span>}
                </Button>

                <div className="hidden items-center gap-1.5 pl-2 @2xl:flex">
                  <MuteButton onClick={handleVolumeToggle} isMuted={isMuted} volume={level} />
                  <Slider aria-label={t('MusicPlayer.volume')} value={[level * 100]} max={100} step={1} onValueChange={([value]) => applyVolume(value / 100)} className="w-16 @5xl:w-20" />
                </div>

                {track && (
                  <Button variant="ghost" size="icon" className="hidden h-8 w-8 @xl:inline-flex" onClick={onExpand} title={t('NowPlaying.title')} aria-label={t('NowPlaying.title')}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                )}
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
