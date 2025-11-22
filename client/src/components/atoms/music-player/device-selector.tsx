import { deviceClient } from '@/clients/device.client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Device } from '@melody-manager/shared';
import { Monitor, Speaker } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  activeDevice: Device | null;
  onDeviceChange: (device: Device | null) => void;
  onDevicesLoad?: (devices: Device[]) => void;
}

export function DeviceSelector({ activeDevice, onDeviceChange, onDevicesLoad }: Props) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);

  const loadDevices = useCallback(async () => {
    try {
      const response = await deviceClient.list();
      const deviceList = response.data || [];
      setDevices(deviceList);
      onDevicesLoad?.(deviceList);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  }, [onDevicesLoad]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) loadDevices();
    },
    [loadDevices],
  );

  const handleDeviceSelect = (device: Device | null) => {
    onDeviceChange(device);
  };

  const getDeviceIcon = (device: Device | null) => {
    if (!device || device.type === 'browser') {
      return <Monitor className="h-4 w-4" />;
    }
    return <Speaker className="h-4 w-4" />;
  };

  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title={t('DeviceSelector.selectDevice')}>
          {getDeviceIcon(activeDevice)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('DeviceSelector.playbackDevices')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => handleDeviceSelect(null)} className={!activeDevice || activeDevice.type === 'browser' ? 'bg-accent' : ''}>
          <Monitor className="h-4 w-4 mr-2" />
          {t('DeviceSelector.thisBrowser')}
        </DropdownMenuItem>

        {devices.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('DeviceSelector.sonosSpeakers')}</DropdownMenuLabel>
            {devices.map((device) => (
              <DropdownMenuItem key={device.id} onClick={() => handleDeviceSelect(device)} className={activeDevice?.id === device.id ? 'bg-accent' : ''}>
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
