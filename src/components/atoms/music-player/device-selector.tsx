import { Cast, Laptop, Monitor, Smartphone, Speaker } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getProviderInfoFromManifests } from '@/components/providers/provider-info';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDevices } from '@/hooks/use-devices';
import { usePlugins } from '@/hooks/use-plugins';
import { type ClientDevice, type Device, type DeviceType, isNetworkDevice, type NetworkDevice } from '@/shared';

// Partial on purpose: the kinds of device on the network are whatever is
// installed, so a kind this list has never heard of still has to draw. It gets
// the speaker, which is what it is.
const deviceIcons: Partial<Record<DeviceType, typeof Monitor>> = {
  browser: Monitor,
  desktop: Laptop,
  mobile: Smartphone,
  sonos: Speaker,
  chromecast: Cast,
};

function DeviceIcon({ type, className }: { type: DeviceType; className?: string }) {
  const Icon = deviceIcons[type] ?? Speaker;
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
  const { others, usableSpeakers: speakers } = useDevices();
  const { manifests } = usePlugins();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);
  const byKind = useMemo(() => {
    const groups = new Map<string, NetworkDevice[]>();
    for (const device of speakers) {
      groups.set(device.type, [...(groups.get(device.type) ?? []), device]);
    }

    return [...groups.entries()];
  }, [speakers]);
  // A speaker is somewhere else just as much as another browser is, and the
  // button says where the sound comes out, not which kind of device it is.
  const elsewhere = remote ?? (activeDevice && isNetworkDevice(activeDevice) ? activeDevice : null);

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

        {/* Named, never verbed. Every other row is a device the click moves the
            music to, and this one is no different; calling it "play here" only
            when something plays elsewhere renamed the row under the listener. */}
        <DropdownMenuItem onClick={() => (onPlayHere ? onPlayHere() : onDeviceChange(null))} className={!remote && !(activeDevice && isNetworkDevice(activeDevice)) ? 'bg-accent' : ''}>
          <Monitor className="h-4 w-4 mr-2 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t('DeviceSelector.thisBrowser')}</span>
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

        {/* Grouped by kind, and named after it: a single heading reading "Sonos
            speakers" put every Chromecast under it. */}
        {byKind.map(([kind, devices]) => (
          <div key={kind}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{providerInfo[kind]?.title ?? kind}</DropdownMenuLabel>
            {devices.map((device) => (
              <DropdownMenuItem key={device.id} onClick={() => onDeviceChange(device)} className={activeDevice?.id === device.id ? 'bg-accent' : ''}>
                <DeviceIcon type={device.type} className="h-4 w-4 mr-2 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{device.name}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
