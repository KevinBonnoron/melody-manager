import { Cast, Check, Laptop, Minus, Monitor, Plus, Smartphone, Speaker } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deviceClient } from '@/clients/device.client';
import { getProviderInfoFromManifests } from '@/components/providers/provider-info';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useDevices } from '@/hooks/use-devices';
import { usePlugins } from '@/hooks/use-plugins';
import { usePointerDismiss } from '@/hooks/use-pointer-dismiss';
import { getMyDeviceId } from '@/lib/device-presence';
import { cn } from '@/lib/utils';
import type { Device, DeviceType, NetworkDevice } from '@/shared';
import { ControlDot } from './control-dot';

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

interface RowProps {
  device: Device;
  label: string;
  playing: boolean;
  alone: boolean;
  mine: boolean;
  onlyHere: () => void;
  alsoHere: () => void;
  notHere: () => void;
}

const SETTLE_MS = 150;

/**
 * How loud a device is belongs to that device, so each one playing carries its
 * own level. A drag sends a change per pixel, so only where it settles is sent.
 */
function DeviceVolume({ device, mine }: { device: Device; mine: boolean }) {
  const { t } = useTranslation();
  const { volume, setVolume } = useMusicPlayer();
  const reported = mine ? volume : device.volume / 100;
  const [asked, setAsked] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (asked !== null && Math.abs(reported - asked) < 0.01) {
      setAsked(null);
    }
  }, [reported, asked]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const level = asked ?? reported;
  const apply = (next: number) => {
    setAsked(next);
    if (mine) {
      setVolume(next);
      return;
    }

    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      deviceClient.setVolume(device.id, Math.round(next * 100)).catch((error) => console.error('Setting the device volume failed:', error));
    }, SETTLE_MS);
  };

  return <Slider aria-label={t('MusicPlayer.volume')} value={[level * 100]} max={100} step={1} onValueChange={([value]) => apply(value / 100)} className="w-full" />;
}

/**
 * A device is chosen by its row and added to the ones already playing by the
 * button beside it, which is what playing the same thing in several rooms at
 * once is made of.
 */
function DeviceRow({ device, label, playing, alone, mine, onlyHere, alsoHere, notHere }: RowProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('rounded-sm', playing && 'bg-accent')}>
      <div className="flex items-center gap-1 pr-1">
        <button type="button" onClick={playing && alone ? undefined : onlyHere} disabled={playing && alone} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/50">
          <DeviceIcon type={device.type} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {playing && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={playing && alone} title={playing ? t('DeviceSelector.removeFromGroup') : t('DeviceSelector.addToGroup')} aria-label={playing ? t('DeviceSelector.removeFromGroup') : t('DeviceSelector.addToGroup')} onClick={playing ? notHere : alsoHere}>
          {playing ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {playing && (
        <div className="px-2 pb-2">
          <DeviceVolume device={device} mine={mine} />
        </div>
      )}
    </div>
  );
}

export function DeviceSelector() {
  const { t } = useTranslation();
  const dismiss = usePointerDismiss();
  const { devices: known, others, usableSpeakers: speakers } = useDevices();
  const { devices: playingOn, playOn, joinDevice, leaveDevice } = useMusicPlayer();
  const { manifests } = usePlugins();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);

  const myId = getMyDeviceId();
  const here = known.find((device) => device.id === myId) ?? null;
  const byKind = useMemo(() => {
    const groups = new Map<string, NetworkDevice[]>();
    for (const device of speakers) {
      groups.set(device.type, [...(groups.get(device.type) ?? []), device]);
    }

    return [...groups.entries()];
  }, [speakers]);

  const plays = (device: Device) => playingOn.some((on) => on.id === device.id);
  const alone = playingOn.length <= 1;
  const elsewhere = playingOn.find((device) => device.id !== myId) ?? null;

  if (!elsewhere && others.length === 0 && speakers.length === 0) {
    return null;
  }

  const row = (device: Device, label: string) => <DeviceRow key={device.id} device={device} label={label} playing={plays(device)} alone={alone} mine={device.id === myId} onlyHere={() => playOn([device])} alsoHere={() => joinDevice(device)} notHere={() => leaveDevice(device)} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild {...dismiss.trigger}>
        <Button variant="ghost" size="icon" className={`group relative h-9 w-9 shrink-0 rounded-full ${elsewhere ? 'bg-primary-soft text-primary hover:text-primary' : ''}`} title={elsewhere ? t('RemotePlayback.playingOn', { device: elsewhere.name }) : t('DeviceSelector.selectDevice')}>
          <DeviceIcon type={elsewhere?.type ?? 'browser'} />
          <ControlDot />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[200] w-72" {...dismiss.content}>
        <DropdownMenuLabel>{t('DeviceSelector.playbackDevices')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {here && row(here, t('DeviceSelector.thisBrowser'))}

        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('DeviceSelector.otherSessions')}</DropdownMenuLabel>
            {others.map((device) => row(device, device.name))}
          </>
        )}

        {byKind.map(([kind, devices]) => (
          <div key={kind}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{providerInfo[kind]?.title ?? kind}</DropdownMenuLabel>
            {devices.map((device) => row(device, device.name))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
