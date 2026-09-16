import type { PluginManifest, Provider } from '@/shared';

export type SourceStatus = 'server' | 'linked' | 'active' | 'unlinked' | 'unconfigured';

export function getSourceStatus(type: string, manifests: PluginManifest[], linkedTypes: Set<string>, hasContent = false): SourceStatus {
  const manifest = manifests.find((m) => m.id === type);
  if (manifest?.scope !== 'personal') {
    return !hasContent && Object.keys(manifest?.unavailable ?? {}).length > 0 ? 'unconfigured' : 'server';
  }

  if (linkedTypes.has(type)) {
    return 'linked';
  }

  return hasContent ? 'active' : 'unlinked';
}

export function isUserConnectable(type: string, manifests: PluginManifest[]): boolean {
  const manifest = manifests.find((m) => m.id === type);
  return manifest?.userConnectable === true && Object.keys(manifest.unavailable ?? {}).length === 0;
}

export function ownsItsLibrary(type: string, manifests: PluginManifest[]): boolean {
  const manifest = manifests.find((m) => m.id === type);
  return manifest?.scope === 'public' && manifest.features.includes('import');
}

export function isSourceInUse(status: SourceStatus): boolean {
  return status !== 'unlinked' && status !== 'unconfigured';
}

export function getTrackProviders(providers: Provider[]): Provider[] {
  return providers.filter((p) => p.category === 'track');
}

export function getDeviceProviders(providers: Provider[]): Provider[] {
  return providers.filter((p) => p.category === 'device');
}
