export type DeviceType = 'browser' | 'mobile' | 'desktop' | 'sonos';
export type DeviceStatus = 'unavailable' | 'available' | 'playing';

interface BaseDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  metadata: Record<string, unknown>;
}

// A client of the user's own, as opposed to a speaker discovered on the network.
export interface ClientDevice extends BaseDevice {
  type: 'browser' | 'mobile' | 'desktop';
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

export interface SonosDevice extends BaseDevice {
  type: 'sonos';
  ipAddress: string;
  volume: number;
  isActive: boolean;
  // Reported by the server, which polls the speaker once for every client.
  playing: boolean;
  trackId: string;
  // Live as of the message it arrived in: count only from local arrival.
  position: number;
}

export type Device = ClientDevice | SonosDevice;
