import type { PluginManifest, Provider } from '@/shared';

export type SourceStatus = 'server' | 'linked' | 'active' | 'unlinked' | 'unconfigured';

// A personal source needs the user's own connection; public/shared ones are
// configured once server-side. A source that already feeds the library is in
// use whether or not an account was ever linked to it.
//
// A server source nobody ever configured is not in service, whatever its
// provider row says. The client cannot read provider_config, so the API
// reports what each manifest still lacks in `unavailable`.
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

// Linking an account to a source the server has not been given its own
// credentials for achieves nothing, so it is not offered until it would.
export function isUserConnectable(type: string, manifests: PluginManifest[]): boolean {
  const manifest = manifests.find((m) => m.id === type);
  return manifest?.userConnectable === true && Object.keys(manifest.unavailable ?? {}).length === 0;
}

// Whether a source's server configuration *is* its library: the files the
// operator pointed the server at. Those can be walked again, and dropping the
// configuration drops the library with it. Everywhere else the server holds a
// copy, and forgetting where it sits costs the copy, not the track.
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
