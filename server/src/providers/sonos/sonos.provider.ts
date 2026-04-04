import type { Device, DeviceStatus, SonosDevice } from '@melody-manager/shared';
import { MetaDataHelper, type SonosDevice as SonosClient, SonosManager } from '@svrooij/sonos';
import type { Track } from '@svrooij/sonos/lib/models/track';
import { encode as encodeXml } from 'html-entities';
import type { DeviceProvider, PlayOptions } from '../types';

interface SonosDeviceInfo {
  client: SonosClient;
  info: SonosDevice;
}

export class SonosProvider implements DeviceProvider {
  private readonly devices = new Map<string, SonosDeviceInfo>();
  private discoveryInProgress = false;
  private initialized = false;
  private manager?: SonosManager;

  public async discoverDevices(): Promise<Device[]> {
    if (this.discoveryInProgress) {
      return Array.from(this.devices.values()).map((d) => d.info);
    }

    this.discoveryInProgress = true;

    try {
      if (!this.initialized) {
        if (!this.manager) {
          this.manager = new SonosManager();
        }

        try {
          await this.manager.InitializeWithDiscovery(30);
          this.initialized = true;
        } catch {
          // Ignore error
        }
      }

      const sonosDevices = this.manager?.Devices || [];
      if (sonosDevices.length === 0 && this.initialized) {
        return Array.from(this.devices.values()).map((d) => d.info);
      }

      const discoveredDevices: Device[] = [];
      for (const sonosDevice of sonosDevices) {
        const name = sonosDevice.Name ?? 'Sonos';
        const ipAddress = sonosDevice.Host;
        const volume = sonosDevice.Volume || 50;

        const existingDevice = this.devices.get(ipAddress);
        const existingSonos = existingDevice?.info.type === 'sonos' ? existingDevice.info : null;

        const deviceData: Device = {
          id: ipAddress.replace(/\./g, '-'),
          name,
          type: 'sonos',
          status: existingDevice?.info.status || ('available' as DeviceStatus),
          ipAddress,
          volume,
          isActive: existingSonos?.isActive || false,
          metadata: {
            uuid: sonosDevice.Uuid,
            roomName: name,
          },
        };

        this.devices.set(ipAddress, {
          client: sonosDevice,
          info: deviceData,
        });

        discoveredDevices.push(deviceData);
      }

      return discoveredDevices;
    } catch {
      return Array.from(this.devices.values()).map((d) => d.info);
    } finally {
      this.discoveryInProgress = false;
    }
  }

  public async play(device: Device, options?: PlayOptions): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    if (options) {
      const { trackUrl, mimeType, title = 'Audio Track', artist = 'Unknown Artist', album = 'Unknown Album', duration } = options;

      const track: Track = {
        Title: title,
        Artist: artist,
        Album: album,
        TrackUri: trackUrl,
        ProtocolInfo: `http-get:*:${mimeType}:*`,
        UpnpClass: 'object.item.audioItem.musicTrack',
        ItemId: '-1',
      };

      if (duration !== undefined) {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = Math.floor(duration % 60);
        track.Duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      const metadata = MetaDataHelper.TrackToMetaData(track, true);
      const encodedMetadata = encodeXml(metadata, { level: 'xml' });
      await sonosClient.AVTransportService.SetAVTransportURI({
        InstanceID: 0,
        CurrentURI: trackUrl,
        CurrentURIMetaData: encodedMetadata,
      });
      await sonosClient.Play();
    } else {
      await sonosClient.Play();
    }
  }

  public async pause(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Pause();
  }

  public async stop(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Stop();
  }

  public async next(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Next();
  }

  public async previous(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Previous();
  }

  public async seek(device: Device, position: number): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    const hours = Math.floor(position / 3600);
    const minutes = Math.floor((position % 3600) / 60);
    const seconds = Math.floor(position % 60);
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    await sonosClient.SeekPosition(timeString);
  }

  public async setVolume(device: Device, volume: number): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.SetVolume(Math.max(0, Math.min(100, volume)));

    this.updateDeviceInfo(device, { volume });
  }

  public async getVolume(device: Device): Promise<number> {
    const sonosClient = this.getSonosClient(device);
    const { CurrentVolume } = await sonosClient.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
    return CurrentVolume;
  }

  public async getCurrentState(device: Device): Promise<string> {
    const sonosClient = this.getSonosClient(device);
    const state = await sonosClient.AVTransportService.GetTransportInfo();
    return state.CurrentTransportState;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  public async getCurrentTrack(device: Device): Promise<any> {
    const sonosClient = this.getSonosClient(device);
    const info = await sonosClient.AVTransportService.GetPositionInfo();
    return info;
  }

  public async addToQueue(device: Device, options: PlayOptions): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    const { trackUrl } = options;
    await sonosClient.AVTransportService.AddURIToQueue({ InstanceID: 0, EnqueuedURI: trackUrl, EnqueuedURIMetaData: '', DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: false });
  }

  public async clearQueue(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.AVTransportService.RemoveAllTracksFromQueue({ InstanceID: 0 });
  }

  public getKnownDevices(): Device[] {
    return Array.from(this.devices.values()).map((d) => d.info);
  }

  private getIpAddress(device: Device): string {
    if ('ipAddress' in device) {
      return device.ipAddress;
    }

    throw new Error('Device does not have an IP address');
  }

  private getSonosClient(device: Device) {
    const ipAddress = this.getIpAddress(device);
    const sonosDevice = this.devices.get(ipAddress);
    if (!sonosDevice) {
      throw new Error(`Device not found: ${ipAddress}`);
    }

    return sonosDevice.client;
  }

  private updateDeviceInfo(device: Device, updated: Partial<SonosDevice>) {
    const sonosDevice = this.devices.get(this.getIpAddress(device));
    if (sonosDevice) {
      sonosDevice.info = { ...sonosDevice.info, ...updated } as SonosDevice;
    }
  }
}
