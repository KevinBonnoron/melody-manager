import type { Device } from '@melody-manager/shared';

export interface PlayOptions {
  trackUrl: string;
  mimeType: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface DeviceSource {
  /** Discover devices on the network */
  discoverDevices(): Promise<Device[]>;

  /** Get all known devices */
  getKnownDevices(): Device[];

  /** Play a track or resume playback */
  play(device: Device, options?: PlayOptions): Promise<void>;

  /** Pause playback */
  pause(device: Device): Promise<void>;

  /** Stop playback */
  stop(device: Device): Promise<void>;

  /** Skip to next track */
  next(device: Device): Promise<void>;

  /** Go back to previous track */
  previous(device: Device): Promise<void>;

  /** Seek to a specific position in seconds */
  seek(device: Device, position: number): Promise<void>;

  /** Set volume (0-100) */
  setVolume(device: Device, volume: number): Promise<void>;

  /** Get current volume */
  getVolume(device: Device): Promise<number>;

  /** Get current playback state */
  getCurrentState(device: Device): Promise<string>;

  /** Get currently playing track info */
  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  getCurrentTrack(device: Device): Promise<any>;

  /** Add track to queue */
  addToQueue(device: Device, options: PlayOptions): Promise<void>;

  /** Clear the queue */
  clearQueue(device: Device): Promise<void>;
}
