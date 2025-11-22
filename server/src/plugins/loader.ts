import type { TrackProviderType } from '@melody-manager/shared';
import { ffmpeg } from '@melody-manager/plugin-sdk';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../lib/config';
import { cacheService, transcodeService, ytDlpService } from '../services';
import type { PluginManifest } from './manifest.type';
import { pluginRegistry } from './registry';
import type { MelodyPlugin, PluginCapabilities } from './types';

const streamDeps = {
  ffmpeg,
  cacheService,
  transcodeService,
  ytDlpService,
};

function capabilitiesFromManifest(manifest: PluginManifest): PluginCapabilities {
  return {
    search: manifest.features.includes('search') ? (manifest.searchTypes ?? []) : undefined,
    stream: manifest.features.includes('stream') ? true : undefined,
    import: manifest.features.includes('import') ? (manifest.importTypes ?? []) : undefined,
  };
}

export async function loadPlugins(): Promise<void> {
  const pluginsDir = config.plugins.dir;
  if (!existsSync(pluginsDir)) {
    return;
  }

  const dirs = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'sdk')
    .map((d) => d.name);

  for (const dir of dirs) {
    const manifestPath = join(pluginsDir, dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest: PluginManifest = await Bun.file(manifestPath).json();
    const entryPath = join(pluginsDir, dir, manifest.entry);

    if (!existsSync(entryPath)) {
      continue;
    }

    try {
      const module = await import(pathToFileURL(entryPath).href);
      const PluginClass = module.default ?? module[Object.keys(module).find((k) => k.endsWith('Plugin'))];
      if (!PluginClass || typeof PluginClass !== 'function') {
        continue;
      }

      const instance = new PluginClass(streamDeps);
      const capabilities = capabilitiesFromManifest(manifest);

      const plugin: MelodyPlugin = {
        id: manifest.id as TrackProviderType,
        name: manifest.name,
        capabilities,
        search: manifest.features.includes('search') && typeof instance.search === 'function' ? instance : undefined,
        stream: manifest.features.includes('stream') && typeof instance.stream === 'function' ? (c, o) => instance.stream(c, o) : undefined,
        import: manifest.features.includes('import') ? instance : undefined,
      };

      pluginRegistry.register(plugin);
    } catch (error) {
      console.error(`[plugins] Failed to load plugin ${dir}:`, error);
    }
  }
}
