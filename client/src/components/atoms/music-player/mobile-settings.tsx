import type { Device } from '@melody-manager/shared';
import { FileAudio, Monitor, Settings, Speaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { AudioFormat } from '@/contexts/music-player-context';

interface MobileSettingsProps {
  activeDevice: Device | null;
  onDeviceChange: (device: Device | null) => void;
  devices: Device[];
  audioFormat: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
}

export function MobileSettings({ activeDevice, onDeviceChange, devices, audioFormat, onFormatChange }: MobileSettingsProps) {
  const formatOptions: { value: AudioFormat; label: string }[] = [
    { value: 'source', label: 'Source (original)' },
    { value: 'mp3', label: 'MP3 320kbps' },
    { value: 'aac', label: 'AAC 256kbps' },
    { value: 'flac', label: 'FLAC (lossless)' },
    { value: 'wav', label: 'WAV (uncompressed)' },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full md:hidden" title="Playback settings">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] px-3">
        <SheetHeader className="pb-4">
          <SheetTitle>Playback Settings</SheetTitle>
          <SheetDescription>Configure playback device and audio format</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pb-6 overflow-y-auto">
          {/* Device Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Playback Device</Label>
            <div className="space-y-2.5">
              <Button variant={!activeDevice || activeDevice.type === 'browser' ? 'default' : 'outline'} className="w-full justify-start h-12 text-base" onClick={() => onDeviceChange(null)}>
                <Monitor className="h-5 w-5 mr-3" />
                This Browser
              </Button>

              {devices.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm font-medium text-muted-foreground px-1 pb-2">Sonos Speakers</p>
                  <div className="space-y-2.5">
                    {devices.map((device) => (
                      <Button key={device.id} variant={activeDevice?.id === device.id ? 'default' : 'outline'} className="w-full justify-start h-12 text-base" onClick={() => onDeviceChange(device)}>
                        <Speaker className="h-5 w-5 mr-3" />
                        {device.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Audio Format */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Audio Format</Label>
            <div className="space-y-2.5">
              {formatOptions.map((option) => (
                <Button key={option.value} variant={audioFormat === option.value ? 'default' : 'outline'} className="w-full justify-start h-12 text-base" onClick={() => onFormatChange(option.value)}>
                  <FileAudio className="h-5 w-5 mr-3" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
