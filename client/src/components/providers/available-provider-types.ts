import type { ConfigSchemaItem, PluginManifest } from '@melody-manager/shared';

export type ProviderTypeWithCategory = { type: string; category: 'track' } | { type: string; category: 'device' };

export function getTrackProviderTypes(manifests: PluginManifest[]): string[] {
  return manifests.filter((m) => !m.features.includes('device')).map((m) => m.id);
}

export function getDeviceProviderTypes(manifests: PluginManifest[]): string[] {
  return manifests.filter((m) => m.features.includes('device')).map((m) => m.id);
}

export function getAllAvailableProviderTypes(manifests: PluginManifest[]): ProviderTypeWithCategory[] {
  return manifests.map((m) => ({
    type: m.id,
    category: m.features.includes('device') ? ('device' as const) : ('track' as const),
  }));
}

function getDefaultValueForSchemaType(schema: ConfigSchemaItem): unknown {
  if (schema.type === 'boolean') {
    return false;
  }
  if (schema.type === 'number') {
    return 0;
  }
  if (schema.type === 'string-list') {
    return [];
  }
  return '';
}

export function getDefaultConfigForType(manifests: PluginManifest[], type: string): Record<string, unknown> {
  const manifest = manifests.find((m) => m.id === type);
  if (!manifest?.configSchema) {
    return {};
  }

  const config: Record<string, unknown> = {};
  for (const field of manifest.configSchema) {
    config[field.name] = getDefaultValueForSchemaType(field);
  }
  return config;
}
