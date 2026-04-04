import type { PluginManifest } from '@melody-manager/shared';
import type { DevicePlugin, DeviceProvider } from './types';

class DeviceRegistry {
  private readonly devices = new Map<string, DevicePlugin>();
  private readonly manifests = new Map<string, PluginManifest>();

  public register(plugin: DevicePlugin, manifest: PluginManifest): void {
    if (plugin.id !== manifest.id) {
      throw new Error(`Device manifest id "${manifest.id}" does not match plugin id "${plugin.id}"`);
    }

    if (this.devices.has(plugin.id)) {
      throw new Error(`Device provider "${plugin.id}" is already registered`);
    }

    this.devices.set(plugin.id, plugin);
    this.manifests.set(plugin.id, manifest);
  }

  public getProvider(id: string): DeviceProvider | undefined {
    return this.devices.get(id)?.device;
  }

  public getManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  public getManifest(id: string): PluginManifest | undefined {
    return this.manifests.get(id);
  }
}

export const deviceRegistry = new DeviceRegistry();
