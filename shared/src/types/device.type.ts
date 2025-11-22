export type DeviceType = 'browser' | 'sonos';
export type DeviceStatus = 'unavailable' | 'available' | 'playing';

interface BaseDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  metadata: Record<string, unknown>;
}

export interface BrowserDevice extends BaseDevice {
  type: 'browser';
}

export interface SonosDevice extends BaseDevice {
  type: 'sonos';
  ipAddress: string;
  volume: number;
  isActive: boolean;
}

export type Device = BrowserDevice | SonosDevice;
