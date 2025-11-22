import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Device } from '@melody-manager/shared';
import { ListMusic } from 'lucide-react';
import { useState } from 'react';
import { DeviceSelector } from './music-player/device-selector';
import { FormatSelector } from './music-player/format-selector';
import { MobileSettings } from './music-player/mobile-settings';
import { MuteButton } from './music-player/mute-button';
import { PlaybackControls } from './music-player/playback-controlts';
import { ProgressBar } from './music-player/progress-bar';
import { QueueSheet } from './music-player/queue-sheet';
import { TrackInfo } from './music-player/track-info';

export function MusicPlayer() {
  const { currentTrack, volume, setVolume, activeDevice, switchDevice, audioFormat, setAudioFormat, queue } = useMusicPlayer();
  const [isMuted, setIsMuted] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);

  const handleVolumeToggle = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(0.5);
    } else {
      setIsMuted(true);
      setVolume(0);
    }
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <Card className="fixed bottom-0 left-0 md:left-12 md:peer-data-[state=expanded]:left-64 right-0 rounded-b-none border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-2xl transition-[left] duration-200 ease-linear">
      <div className="container mx-auto px-2 md:px-4 py-2 md:py-4">
        <div className="flex flex-col gap-2">
          <ProgressBar />

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
            <TrackInfo track={currentTrack} />
            <PlaybackControls />

            <div className="flex items-center justify-end gap-2">
              <div className="hidden md:flex items-center gap-2 w-32">
                <MuteButton onClick={handleVolumeToggle} isMuted={isMuted} volume={volume} />
                <Slider
                  value={[volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={([value]) => {
                    setVolume(value / 100);
                    setIsMuted(value === 0);
                  }}
                  className="flex-1"
                />
              </div>

              <MobileSettings activeDevice={activeDevice} onDeviceChange={switchDevice} devices={devices} audioFormat={audioFormat} onFormatChange={setAudioFormat} />

              <div className="hidden md:flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setQueueOpen(true)} className="relative">
                  <ListMusic className="h-5 w-5" />
                  {queue.length > 0 && (
                    <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs">
                      {queue.length}
                    </Badge>
                  )}
                </Button>
                <FormatSelector audioFormat={audioFormat} onFormatChange={setAudioFormat} />
                <DeviceSelector activeDevice={activeDevice} onDeviceChange={switchDevice} onDevicesLoad={setDevices} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
    </Card>
  );
}
