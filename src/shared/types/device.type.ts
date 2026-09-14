// A client of the user's own announces itself as one of these. Anything else on
// the list is a device on the network, named after the provider it is
// configured under, and that list grows: the client is told what kinds exist
// rather than knowing them.
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
  // Whether anybody may play to it. A device on the network is discovered
  // whatever the operator has decided, so a new one can be put in front of an
  // admin; this is what says the decision was yes. A client of one's own is
  // always usable.
  usable: boolean;
}

// A client of the user's own, as opposed to a device found on the network.
export interface ClientDevice extends BaseDevice {
  type: ClientDeviceType;
  session: string;
  playing: boolean;
  trackId: string;
  // Live as of the message it arrived in: count only from local arrival.
  position: number;
  volume: number;
}

export interface DeviceCommand {
  deviceId: string;
  action: string;
}

// Something the server reaches over the network and speaks a protocol to: a
// Sonos, a Chromecast, whatever comes next. What tells them apart is the
// protocol, which is the server's business, so this side only needs to know
// that it is not one of ours.
export interface NetworkDevice extends BaseDevice {
  ipAddress: string;
  volume: number;
  isActive: boolean;
  // Reported by the server, which polls the device once for every client.
  playing: boolean;
  trackId: string;
  // Live as of the message it arrived in: count only from local arrival.
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
