import type { ConfigSchemaItem, PluginManifest } from '@melody-manager/shared';

export type ProviderTypeWithCategory = { type: string; category: 'track' } | { type: string; category: 'device' };

export function getPersonalProviderManifests(manifests: PluginManifest[]): PluginManifest[] {
  return manifests.filter((m) => m.scope === 'personal');
}

export function getSharedProviderManifests(manifests: PluginManifest[]): PluginManifest[] {
  return manifests.filter((m) => m.scope === 'shared');
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

export function getDefaultConfigForType(manifests: PluginManifest[], type: string, useConnectionSchema = false): Record<string, unknown> {
  const manifest = manifests.find((m) => m.id === type);
  const schema = useConnectionSchema ? (manifest?.connectionSchema ?? manifest?.configSchema) : manifest?.configSchema;
  if (!schema) {
    return {};
  }

  const config: Record<string, unknown> = {};
  for (const field of schema) {
    config[field.name] = getDefaultValueForSchemaType(field);
  }

  return config;
}
