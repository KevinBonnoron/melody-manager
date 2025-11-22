import type { Device, DeviceStatus, SonosDevice } from '@melody-manager/shared';
import { MetaDataHelper, type SonosDevice as SonosClient, SonosManager } from '@svrooij/sonos';
import type { Track } from '@svrooij/sonos/lib/models/track';
import { encode as encodeXml } from 'html-entities';
import { logger } from '../lib/logger';
import type { DeviceSource, PlayOptions } from '../types';

interface SonosDeviceInfo {
  client: SonosClient;
  info: SonosDevice;
}

class SonosSource implements DeviceSource {
  private devices = new Map<string, SonosDeviceInfo>();
  private discoveryInProgress = false;
  private initialized = false;
  private manager?: SonosManager;

  /** Discover Sonos devices on the network */
  async discoverDevices(): Promise<Device[]> {
    if (this.discoveryInProgress) {
      return Array.from(this.devices.values()).map((d) => d.info);
    }

    this.discoveryInProgress = true;

    try {
      // Only initialize once
      if (!this.initialized) {
        if (!this.manager) {
          this.manager = new SonosManager();
        }

        // Try discovery if manual init failed or wasn't attempted
        if (!this.initialized) {
          try {
            await this.manager.InitializeWithDiscovery(30);
            this.initialized = true;
          } catch {
            // Ignore error
          }
        }
      }

      const sonosDevices = this.manager?.Devices || [];

      if (sonosDevices.length === 0 && this.initialized) {
        logger.info('[Sonos] No devices available');
        return Array.from(this.devices.values()).map((d) => d.info);
      }

      // Update devices map with current devices from manager
      const discoveredDevices: Device[] = [];

      for (const sonosDevice of sonosDevices) {
        const name = sonosDevice.Name ?? 'Sonos';
        const ipAddress = sonosDevice.Host;
        const volume = sonosDevice.Volume || 50;

        // Check if we already have this device
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
    } catch (error) {
      logger.error(`[Sonos] Discovery error: ${error}`);
      return Array.from(this.devices.values()).map((d) => d.info);
    } finally {
      this.discoveryInProgress = false;
    }
  }
  /** Play a track or resume playback */
  async play(device: Device, options?: PlayOptions): Promise<void> {
    const sonosClient = this.getSonosClient(device);

    if (options) {
      const { trackUrl, mimeType, title = 'Audio Track', artist = 'Unknown Artist', album = 'Unknown Album', duration } = options;

      // Build track metadata using @svrooij/sonos library
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

      // Generate DIDL-Lite XML and encode it for SOAP transmission
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

  /** Pause playback */
  async pause(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Pause();
  }

  /** Stop playback */
  async stop(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Stop();
  }

  /** Skip to next track */
  async next(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Next();
  }

  /** Go back to previous track */
  async previous(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.Previous();
  }

  /** Seek to a specific position in seconds */
  async seek(device: Device, position: number): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    const hours = Math.floor(position / 3600);
    const minutes = Math.floor((position % 3600) / 60);
    const seconds = Math.floor(position % 60);
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    await sonosClient.SeekPosition(timeString);
  }

  /** Set volume (0-100) */
  async setVolume(device: Device, volume: number): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.SetVolume(Math.max(0, Math.min(100, volume)));

    this.updateDeviceInfo(device, { volume });
  }

  /** Get current playback state */
  async getCurrentState(device: Device): Promise<string> {
    const sonosClient = this.getSonosClient(device);
    const state = await sonosClient.AVTransportService.GetTransportInfo();
    return state.CurrentTransportState;
  }

  /** Get currently playing track info */
  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  async getCurrentTrack(device: Device): Promise<any> {
    const sonosClient = this.getSonosClient(device);
    const info = await sonosClient.AVTransportService.GetPositionInfo();
    return info;
  }

  /** Get current volume */
  async getVolume(device: Device): Promise<number> {
    const sonosClient = this.getSonosClient(device);
    const { CurrentVolume } = await sonosClient.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
    return CurrentVolume;
  }

  /** Add track to queue */
  async addToQueue(device: Device, options: PlayOptions): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    const { trackUrl } = options;
    await sonosClient.AVTransportService.AddURIToQueue({ InstanceID: 0, EnqueuedURI: trackUrl, EnqueuedURIMetaData: '', DesiredFirstTrackNumberEnqueued: 0, EnqueueAsNext: false });
  }

  /** Clear the queue */
  async clearQueue(device: Device): Promise<void> {
    const sonosClient = this.getSonosClient(device);
    await sonosClient.AVTransportService.RemoveAllTracksFromQueue({ InstanceID: 0 });
  }

  /** List all known devices */
  getKnownDevices(): Device[] {
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
      sonosDevice.info = { ...sonosDevice.info, ...updated };
    }
  }
}

export const sonosSource = new SonosSource();
