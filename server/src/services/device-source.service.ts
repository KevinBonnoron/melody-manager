import type { Device, DeviceProvider } from '@melody-manager/shared';
import { config } from '../lib/config';
import { pluginRegistry } from '../plugins';
import type { DeviceProvider as DeviceProviderPlugin, PlayOptions } from '../plugins/types';
import { providerRepository, trackRepository } from '../repositories';
import { buildStreamUrl, getMimeType } from '../utils';

type DeviceChangeListener = (devices: Device[]) => void;

class DeviceSourceService {
  private discoveryInterval?: Timer;
  private readonly listeners = new Set<DeviceChangeListener>();

  public constructor() {
    this.startAutoDiscovery();
  }

  public startAutoDiscovery(intervalMs = 5000) {
    this.discoverDevices();

    this.discoveryInterval = setInterval(() => {
      this.discoverDevices();
    }, intervalMs);
  }

  public stopAutoDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
    }
  }

  public onDevicesChange(callback: DeviceChangeListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private async notifyListeners() {
    const devices = await this.getKnownDevices();
    for (const listener of this.listeners) {
      try {
        listener(devices);
      } catch (error) {
        console.error('Device change listener failed', error);
      }
    }
  }

  private getDevicePlugin(device: Device): DeviceProviderPlugin {
    const plugin = pluginRegistry.getDeviceProvider(device.type);
    if (!plugin) {
      throw new Error(`No plugin available for device type: ${device.type}`);
    }
    return plugin;
  }

  private async getDeviceById(deviceId: string): Promise<Device> {
    const allDevices = await this.getKnownDevices();
    const device = allDevices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return device;
  }

  public async discoverDevices(): Promise<Device[]> {
    const providers = (await providerRepository.getAllBy('category = "device" && enabled = true')) as DeviceProvider[];
    const devices = await Promise.all(
      providers.map(async (provider) => {
        const plugin = pluginRegistry.getDeviceProvider(provider.type);
        if (plugin) {
          return plugin.discoverDevices();
        }
        return [];
      }),
    );
    const allDevices = devices.flat();

    await this.notifyListeners();

    return allDevices;
  }

  public async getKnownDevices(): Promise<Device[]> {
    const providers = (await providerRepository.getAllBy('category = "device" && enabled = true')) as DeviceProvider[];
    const devices = await Promise.all(
      providers.map(async (provider) => {
        const plugin = pluginRegistry.getDeviceProvider(provider.type);
        if (plugin) {
          return plugin.getKnownDevices();
        }
        return [];
      }),
    );
    return devices.flat();
  }

  public async playTrack(deviceId: string, trackId: string): Promise<void> {
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
      artist: track.expand?.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist',
      album: track.expand?.album?.name || 'Unknown Album',
      duration: track.duration,
    };

    const plugin = this.getDevicePlugin(device);
    await plugin.play(device, playOptions);
    await this.notifyListeners();
  }

  public async resume(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    await plugin.play(device);
    await this.notifyListeners();
  }

  public async pause(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    await plugin.pause(device);
    await this.notifyListeners();
  }

  public async stop(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    await plugin.stop(device);
    await this.notifyListeners();
  }

  public async next(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.next(device);
  }

  public async previous(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.previous(device);
  }

  public async seek(deviceId: string, position: number): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.seek(device, position);
  }

  public async setVolume(deviceId: string, volume: number): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.setVolume(device, volume);
  }

  public async getVolume(deviceId: string): Promise<number> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.getVolume(device);
  }

  public async getCurrentState(deviceId: string): Promise<string> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.getCurrentState(device);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  public async getCurrentTrack(deviceId: string): Promise<any> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.getCurrentTrack(device);
  }

  public async addTrackToQueue(deviceId: string, trackId: string): Promise<void> {
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
      artist: track.expand?.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist',
      album: track.expand?.album?.name || 'Unknown Album',
      duration: track.duration,
    };

    const plugin = this.getDevicePlugin(device);
    return plugin.addToQueue(device, playOptions);
  }

  public async clearQueue(deviceId: string): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    const plugin = this.getDevicePlugin(device);
    return plugin.clearQueue(device);
  }
}

export const deviceSourceService = new DeviceSourceService();
