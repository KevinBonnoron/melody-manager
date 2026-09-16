export const CLIENT_DEVICE_TYPES = ['browser', 'mobile', 'desktop'] as const;

export type ClientDeviceType = (typeof CLIENT_DEVICE_TYPES)[number];
export type DeviceType = ClientDeviceType | (string & {});
export type DeviceStatus = 'unavailable' | 'available' | 'playing';

interface BaseDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  metadata: Record<string, unknown>;
  usable: boolean;
}

export interface ClientDevice extends BaseDevice {
  type: ClientDeviceType;
  session: string;
  playing: boolean;
  trackId: string;
  position: number;
  volume: number;
}

export interface DeviceCommand {
  deviceId: string;
  action: string;
}

export interface NetworkDevice extends BaseDevice {
  ipAddress: string;
  volume: number;
  isActive: boolean;
  playing: boolean;
  trackId: string;
  position: number;
}

export type Device = ClientDevice | NetworkDevice;

const clientTypes = new Set<string>(CLIENT_DEVICE_TYPES);

export function isClientDevice(device: Device): device is ClientDevice {
  return clientTypes.has(device.type);
}

export function isNetworkDevice(device: Device): device is NetworkDevice {
  return !clientTypes.has(device.type);
}
