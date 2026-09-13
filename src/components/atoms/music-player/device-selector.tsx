import { Laptop, Monitor, Smartphone, Speaker } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDevices } from '@/hooks/use-devices';
import type { ClientDevice, Device, DeviceType } from '@/shared';

const deviceIcons: Record<DeviceType, typeof Monitor> = {
  browser: Monitor,
  desktop: Laptop,
  mobile: Smartphone,
  sonos: Speaker,
};

function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  const Icon = deviceIcons[type];
  return <Icon className={className ?? 'h-4 w-4'} />;
}

interface Props {
  activeDevice: Device | null;
  onDeviceChange: (device: Device | null) => void;
  remote?: Device;
  onPlayHere?: () => void;
  onSelectClient?: (device: ClientDevice) => void;
}

export function DeviceSelector({ activeDevice, onDeviceChange, remote, onPlayHere, onSelectClient }: Props) {
  const { t } = useTranslation();
  const { others, speakers } = useDevices();
  // A speaker is somewhere else just as much as another browser is, and the
  // button says where the sound comes out, not which kind of device it is.
  const elsewhere = remote ?? (activeDevice?.type === 'sonos' ? activeDevice : null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={`h-9 w-9 shrink-0 rounded-full ${elsewhere ? 'bg-primary-soft text-primary hover:text-primary' : ''}`} title={elsewhere ? t('RemotePlayback.playingOn', { device: elsewhere.name }) : t('DeviceSelector.selectDevice')}>
          <DeviceIcon type={elsewhere?.type ?? 'browser'} />
        </Button>
      </DropdownMenuTrigger>
      {/* Wide enough for a device name beside the badge that says it is the one
          playing: at w-56 the name was cut to a few characters. */}
      <DropdownMenuContent align="end" className="z-[200] w-72">
        <DropdownMenuLabel>{t('DeviceSelector.playbackDevices')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => (onPlayHere ? onPlayHere() : onDeviceChange(null))} className={!remote && activeDevice?.type !== 'sonos' ? 'bg-accent' : ''}>
          <Monitor className="h-4 w-4 mr-2" />
          {onPlayHere ? t('RemotePlayback.playHere') : t('DeviceSelector.thisBrowser')}
        </DropdownMenuItem>

        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('DeviceSelector.otherSessions')}</DropdownMenuLabel>
            {others.map((device) => (
              <DropdownMenuItem key={device.id} onClick={() => onSelectClient?.(device)} disabled={!onSelectClient} className={device.playing ? 'bg-accent' : ''}>
                <DeviceIcon type={device.type} className="h-4 w-4 mr-2 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{device.name}</span>
                {device.playing && <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">{t('DeviceSelector.playingNow')}</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {speakers.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('DeviceSelector.sonosSpeakers')}</DropdownMenuLabel>
            {speakers.map((device) => (
              <DropdownMenuItem key={device.id} onClick={() => onDeviceChange(device)} className={activeDevice?.id === device.id ? 'bg-accent' : ''}>
                <Speaker className="h-4 w-4 mr-2" />
                {device.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
