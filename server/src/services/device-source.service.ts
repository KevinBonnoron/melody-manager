import type { Device, DeviceProvider, DeviceType } from '@melody-manager/shared';
import { config } from '../lib/config';
import { providerRepository, trackRepository } from '../repositories';
import { sonosSource } from '../sources';
import type { DeviceSource, PlayOptions } from '../types';
import { buildStreamUrl, getMimeType } from '../utils';

const deviceSources: Record<DeviceType, DeviceSource> = {
  sonos: sonosSource,
  browser: null as unknown as DeviceSource,
};

type DeviceChangeListener = (devices: Device[]) => void;

class DeviceSourceService {
  private discoveryInterval?: Timer;
  private listeners = new Set<DeviceChangeListener>();

  constructor() {
    // Start auto-discovery on service initialization
    this.startAutoDiscovery();
  }

  /** Start automatic device discovery */
  startAutoDiscovery(intervalMs = 5000) {
    // Immediate discovery
    this.discoverDevices();

    // Periodic discovery
    this.discoveryInterval = setInterval(() => {
      this.discoverDevices();
    }, intervalMs);
  }

  /** Stop automatic device discovery */
  stopAutoDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
    }
  }

  /** Subscribe to device changes */
  onDevicesChange(callback: DeviceChangeListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Notify all listeners of device changes */
  private async notifyListeners() {
    const devices = await this.getKnownDevices();
    for (const listener of this.listeners) {
      listener(devices);
    }
  }

  private getDeviceSource(device: Device): DeviceSource {
    const source = deviceSources[device.type];
    if (!source) {
      throw new Error(`No source available for device type: ${device.type}`);
    }

    return source;
  }

  private async getDeviceById(deviceId: string): Promise<Device> {
    const allDevices = await this.getKnownDevices();
    const device = allDevices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return device;
  }

  async discoverDevices(): Promise<Device[]> {
    const providers = (await providerRepository.getAllBy('category = "device" && enabled = true')) as DeviceProvider[];
    const devices = await Promise.all(
      providers.map(async (provider) => {
        const deviceSource = deviceSources[provider.type];
        if (deviceSource) {
          return deviceSource.discoverDevices();
        }
        return [];
      }),
    );
    const allDevices = devices.flat();

    this.notifyListeners();

    return allDevices;
  }

  async getKnownDevices(): Promise<Device[]> {
    const providers = (await providerRepository.getAllBy('category = "device" && enabled = true')) as DeviceProvider[];
    const devices = await Promise.all(
      providers.map(async (provider) => {
        const deviceSource = deviceSources[provider.type];
        if (deviceSource) {
          return deviceSource.getKnownDevices();
        }
        return [];
      }),
    );
    return devices.flat();
  }

  async playTrack(deviceId: string, trackId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const track = await trackRepository.getOne(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    const baseUrl = config.server.url;
    if (!baseUrl) {
      throw new Error('SERVER_URL is not configured');
    }

    const streamUrl = buildStreamUrl(track, device, baseUrl);
    const mimeType = getMimeType(track, device);

    const playOptions: PlayOptions = {
      trackUrl: streamUrl,
      mimeType,
      title: track.title,
      artist: track.expand.artists.map((artist) => artist.name).join(', ') ?? 'Unknown Artist',
      album: track.expand.album.name ?? 'Unknown Album',
      duration: track.duration,
    };

    const source = this.getDeviceSource(device);
    await source.play(device, playOptions);
    this.notifyListeners();
  }

  async resume(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    await source.play(device);
    this.notifyListeners();
  }

  async pause(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    await source.pause(device);
    this.notifyListeners();
  }

  async stop(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    await source.stop(device);
    this.notifyListeners();
  }

  async next(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.next(device);
  }

  async previous(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.previous(device);
  }

  async seek(deviceId: string, position: number): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.seek(device, position);
  }

  async setVolume(deviceId: string, volume: number): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.setVolume(device, volume);
  }

  async getVolume(deviceId: string): Promise<number> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.getVolume(device);
  }

  async getCurrentState(deviceId: string): Promise<string> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.getCurrentState(device);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  async getCurrentTrack(deviceId: string): Promise<any> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.getCurrentTrack(device);
  }

  async addTrackToQueue(deviceId: string, trackId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const track = await trackRepository.getOne(trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }

    const baseUrl = config.server.url;
    if (!baseUrl) {
      throw new Error('SERVER_URL is not configured');
    }
    const streamUrl = buildStreamUrl(track, device, baseUrl);
    const mimeType = getMimeType(track, device);

    const playOptions: PlayOptions = {
      trackUrl: streamUrl,
      mimeType,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
    };

    const source = this.getDeviceSource(device);
    return source.addToQueue(device, playOptions);
  }

  async clearQueue(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const source = this.getDeviceSource(device);
    return source.clearQueue(device);
  }
}

export const deviceSourceService = new DeviceSourceService();
